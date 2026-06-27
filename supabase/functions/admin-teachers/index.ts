/**
 * Admin CRUD for teacher_profiles.
 *
 * POST   /functions/v1/admin-teachers  { action, ... }
 * Actions: list | create | update | delete
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

  return { supabaseAdmin, email: user.email };
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

  const { supabaseAdmin } = auth;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body.action as string;

  if (action === 'list') {
    const { data, error } = await supabaseAdmin
      .from('teacher_profiles')
      .select('id, email, name, faculty, departments')
      .order('email');
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ teachers: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const faculty = String(body.faculty ?? '').trim().toUpperCase();
    const name = body.name ? String(body.name).trim() : null;
    const departments = Array.isArray(body.departments)
      ? body.departments.map((d) => String(d).trim().toUpperCase()).filter(Boolean)
      : [];

    if (!email || !faculty) {
      return new Response(JSON.stringify({ error: 'email and faculty are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabaseAdmin
      .from('teacher_profiles')
      .insert({ email, name, faculty, departments })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ teacher: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (action === 'update') {
    const id = String(body.id ?? '');
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updates: Record<string, unknown> = {};
    if (body.email) updates.email = String(body.email).trim().toLowerCase();
    if (body.name !== undefined) updates.name = body.name ? String(body.name).trim() : null;
    if (body.faculty) updates.faculty = String(body.faculty).trim().toUpperCase();
    if (Array.isArray(body.departments)) {
      updates.departments = body.departments.map((d) => String(d).trim().toUpperCase()).filter(Boolean);
    }

    const { data, error } = await supabaseAdmin
      .from('teacher_profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ teacher: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (action === 'delete') {
    const id = String(body.id ?? '');
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabaseAdmin.from('teacher_profiles').delete().eq('id', id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
