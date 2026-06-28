/**
 * Public page-view tracking endpoint (no auth).
 *
 * POST /functions/v1/analytics-track
 * Body: { path, view_name, visitor_id, referrer?, device_type?, browser?, os? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_VIEWS = new Set(['curriculum', 'teacher', 'unknown']);

const rateLimit = new Map<string, number>();
const RATE_MS = 1000;

function isRateLimited(visitorId: string): boolean {
  const now = Date.now();
  const last = rateLimit.get(visitorId) ?? 0;
  if (now - last < RATE_MS) return true;
  rateLimit.set(visitorId, now);
  if (rateLimit.size > 10_000) {
    const cutoff = now - 60_000;
    for (const [k, v] of rateLimit) {
      if (v < cutoff) rateLimit.delete(k);
    }
  }
  return false;
}

function trim(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ua = req.headers.get('user-agent') ?? '';
  if (!ua.trim()) {
    return new Response(JSON.stringify({ ok: true, skipped: 'bot' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const path = trim(body.path, 500);
  const viewName = trim(body.view_name, 50);
  const visitorId = trim(body.visitor_id, 64);

  if (!path || !viewName || !visitorId) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!UUID_RE.test(visitorId)) {
    return new Response(JSON.stringify({ error: 'Invalid visitor_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!VALID_VIEWS.has(viewName)) {
    return new Response(JSON.stringify({ error: 'Invalid view_name' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (isRateLimited(visitorId)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'rate_limit' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabaseAdmin.from('page_views').insert({
    path,
    view_name: viewName,
    visitor_id: visitorId,
    referrer: trim(body.referrer, 2000),
    device_type: trim(body.device_type, 32),
    browser: trim(body.browser, 64),
    os: trim(body.os, 64),
  });

  if (error) {
    console.error('analytics-track insert error:', error.message);
    return new Response(JSON.stringify({ error: 'Failed to record view' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
