/**
 * Supabase Edge Function: offer-refresh
 *
 * Authenticates with the USFQ course catalog on behalf of the student,
 * scrapes the current offer, and upserts it into the `course_offer` table.
 *
 * Rate-limited to one call per user every 5 minutes.
 *
 * POST /functions/v1/offer-refresh
 * Headers: Authorization: Bearer <supabase-access-token>
 * Body:    { username: string, password: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CATALOG_BASE = 'https://catalogodecursos.usfq.edu.ec';
const COOLDOWN_MS = 5 * 60 * 1000;

interface CourseRow {
  nrc: string;
  course_code: string;
  title: string;
  type: string;
  section_letter: string | null;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  teacher: string | null;
  available: number | null;
  total: number | null;
  period: string;
  last_updated: string;
}

const DAYS_MAP: Record<string, string> = {
  L: 'Lun', M: 'Mar', W: 'Mié', J: 'Jue', V: 'Vie', S: 'Sáb',
};

function parseDays(raw: string): string[] {
  return [...raw.toUpperCase().matchAll(/[LMWJVS]/g)].map(m => DAYS_MAP[m[0]] ?? m[0]);
}

function parseTime(raw: string): [string | null, string | null] {
  const m = raw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  return m ? [m[1], m[2]] : [null, null];
}

function parseSlots(raw: string): [number | null, number | null] {
  const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2])] : [null, null];
}

function classifyType(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t.includes('ejerc') || t === 'ej') return 'Ejercicios';
  if (t.includes('lab')) return 'Laboratorio';
  return 'Teoría';
}

async function fetchWithSession(
  loginUrl: string,
  username: string,
  password: string
): Promise<{ cookies: string; period: string }> {
  // Step 1: GET the login page to grab any CSRF token / session cookie
  const init = await fetch(loginUrl, { redirect: 'follow' });
  const initHtml = await init.text();
  const cookieHeader = init.headers.get('set-cookie') ?? '';

  // Extract CSRF token if present (common patterns)
  const csrfMatch =
    initHtml.match(/name=["']_csrf["']\s+value=["']([^"']+)["']/) ??
    initHtml.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/);
  const csrf = csrfMatch?.[1] ?? '';

  // Step 2: POST credentials
  const body = new URLSearchParams({ username, password });
  if (csrf) body.set('_csrf', csrf);

  const loginResp = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
      'User-Agent': 'Mozilla/5.0 (compatible; USFQ-Planner-Bot/1.0)',
    },
    body: body.toString(),
    redirect: 'follow',
  });

  const cookies = loginResp.headers.get('set-cookie') ?? cookieHeader;
  if (!loginResp.ok && loginResp.status !== 302) {
    throw new Error(`Login failed with status ${loginResp.status}`);
  }

  // Try to detect current period from the page
  const html = await loginResp.text().catch(() => '');
  const periodMatch = html.match(/periodo[^>]*>([^<]+semestre|verano[^<]+)/i);
  const period = periodMatch?.[1]?.trim() ?? new Date().getFullYear() + '-current';

  return { cookies, period };
}

async function scrapeCatalogPage(
  url: string,
  cookies: string,
  period: string
): Promise<CourseRow[]> {
  const resp = await fetch(url, {
    headers: {
      Cookie: cookies,
      Accept: 'application/json, text/html',
      'User-Agent': 'Mozilla/5.0 (compatible; USFQ-Planner-Bot/1.0)',
    },
  });

  if (!resp.ok) throw new Error(`Catalog fetch failed: ${resp.status}`);

  const contentType = resp.headers.get('content-type') ?? '';
  const now = new Date().toISOString();

  // If the API returns JSON directly
  if (contentType.includes('application/json')) {
    const data: unknown[] = await resp.json();
    return (data as Record<string, string>[]).map(r => {
      const [start_time, end_time] = parseTime(r.horario ?? '');
      const [available, total] = parseSlots(r.disponibles ?? '');
      return {
        nrc: String(r.nrc ?? ''),
        course_code: String(r.codigo ?? r.course_code ?? ''),
        title: String(r.titulo ?? r.title ?? ''),
        type: classifyType(String(r.tipo ?? r.type ?? '')),
        section_letter: String(r.seccion ?? r.section ?? '') || null,
        days: parseDays(String(r.dias ?? r.days ?? '')),
        start_time,
        end_time,
        teacher: String(r.profesor ?? r.teacher ?? '') || null,
        available,
        total,
        period,
        last_updated: now,
      };
    });
  }

  // HTML fallback — parse table rows
  const html = await resp.text();
  const rows: CourseRow[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const tagRegex = /<[^>]+>/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(tagRegex, '').trim());
    }
    if (cells.length < 7) continue;
    if (!/^\d{4,6}$/.test(cells[0])) continue;

    const [start_time, end_time] = parseTime(cells[5]);
    const [available, total] = parseSlots(cells[7] ?? '');
    rows.push({
      nrc: cells[0],
      course_code: cells[1],
      title: cells[2],
      type: classifyType(cells[3]),
      section_letter: cells[4] || null,
      days: parseDays(cells[5].split('\n')[0] ?? ''),
      start_time,
      end_time,
      teacher: cells[6] || null,
      available,
      total,
      period,
      last_updated: now,
    });
  }

  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Authenticate via Supabase JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const accessToken = authHeader.replace('Bearer ', '');
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Missing authorization token' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Validate user token
  const { data: { user }, error: authError } = await sb.auth.getUser(accessToken);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Rate limit check: store last refresh time in user metadata
  const lastRefreshIso = user.user_metadata?.offer_last_refresh as string | undefined;
  if (lastRefreshIso) {
    const elapsed = Date.now() - new Date(lastRefreshIso).getTime();
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return new Response(
        JSON.stringify({ error: `Rate limited. Try again in ${waitSec}s.` }),
        { status: 429 }
      );
    }
  }

  // Parse body
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'username and password are required' }), { status: 400 });
  }

  try {
    // Login to USFQ catalog
    const loginUrl = `${CATALOG_BASE}/dashboard/home`;
    const { cookies, period } = await fetchWithSession(loginUrl, username, password);

    // Scrape — try JSON API endpoint first, then HTML
    const apiUrl = `${CATALOG_BASE}/api/courses?page=1&per_page=5000`;
    const courses = await scrapeCatalogPage(apiUrl, cookies, period);

    if (courses.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No courses found — login may have failed or page structure changed.' }),
        { status: 502 }
      );
    }

    // Archive current offer before overwriting
    const { data: existing } = await sb.from('course_offer').select('*');
    if (existing && existing.length > 0) {
      const historyRows = existing.map(r => ({ ...r, id: undefined, last_updated: undefined, scraped_at: new Date().toISOString() }));
      const chunkSize = 500;
      for (let i = 0; i < historyRows.length; i += chunkSize) {
        await sb.from('course_offer_history').insert(historyRows.slice(i, i + chunkSize));
      }
    }

    // Upsert new data in chunks
    const chunkSize = 500;
    for (let i = 0; i < courses.length; i += chunkSize) {
      await sb.from('course_offer').upsert(courses.slice(i, i + chunkSize), { onConflict: 'nrc' });
    }

    // Update last refresh timestamp in user metadata
    await sb.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, offer_last_refresh: new Date().toISOString() },
    });

    return new Response(
      JSON.stringify({ ok: true, count: courses.length, period }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    console.error('offer-refresh error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
