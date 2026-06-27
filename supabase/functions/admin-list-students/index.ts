/**
 * List registered student emails for admin messaging.
 *
 * POST /functions/v1/admin-list-students
 * Body: { faculty?: string }  — filter by curriculum_id prefix (e.g. CMP)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { error: 'Unauthorized', status: 401 as const };
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user?.email) {
    return { error: 'Unauthorized', status: 401 as const };
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: adminRow } = await supabaseAdmin
    .from('admin_profiles')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (!adminRow) {
    return { error: 'Forbidden', status: 403 as const };
  }

  return { supabaseAdmin };
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

  const auth = await requireAdmin(req);
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { faculty?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const facultyFilter = body.faculty?.trim().toUpperCase() || null;
  const { supabaseAdmin } = auth;

  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 1000,
  });

  if (usersError) {
    return new Response(JSON.stringify({ error: usersError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const teacherEmails = new Set<string>();
  const { data: teachers } = await supabaseAdmin.from('teacher_profiles').select('email');
  for (const t of teachers ?? []) {
    if (t.email) teacherEmails.add(t.email.toLowerCase());
  }

  const adminEmails = new Set<string>();
  const { data: admins } = await supabaseAdmin.from('admin_profiles').select('email');
  for (const a of admins ?? []) {
    if (a.email) adminEmails.add(a.email.toLowerCase());
  }

  let progressRows: { user_id: string; curriculum_id: string }[] = [];
  if (facultyFilter) {
    const { data, error } = await supabaseAdmin
      .from('user_progress')
      .select('user_id, curriculum_id')
      .ilike('curriculum_id', `%${facultyFilter}%`);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    progressRows = data ?? [];
  }

  const allowedUserIds = facultyFilter
    ? new Set(progressRows.map((r) => r.user_id))
    : null;

  const emails: string[] = [];
  for (const u of usersData.users) {
    const email = u.email?.toLowerCase();
    if (!email) continue;
    if (teacherEmails.has(email) || adminEmails.has(email)) continue;
    if (allowedUserIds && !allowedUserIds.has(u.id)) continue;
    emails.push(email);
  }

  emails.sort();

  return new Response(JSON.stringify({ emails, count: emails.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
