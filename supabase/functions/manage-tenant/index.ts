import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOGIN_DOMAIN = 'tenants.biznexco.app';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userResp, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userResp?.user) return json({ error: 'Invalid session' }, 401);
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: callerProfile } = await adminClient.from('profiles').select('role').eq('id', userResp.user.id).single();
    if (!callerProfile || callerProfile.role !== 'owner') return json({ error: 'Only owners can manage tenant accounts' }, 403);
    const body = await req.json();
    const action = String(body.action || '');
    const tenantId = String(body.tenantId || '');
    if (!tenantId) return json({ error: 'Tenant id is required' }, 400);
    const { data: tenant, error: tenantErr } = await adminClient.from('tenants').select('id, profile_id, owner_id, username, login_email, is_active').eq('id', tenantId).eq('owner_id', userResp.user.id).single();
    if (tenantErr || !tenant) return json({ error: 'Tenant not found or not owned by you' }, 404);
    if (!tenant.profile_id) return json({ error: 'Tenant has no linked login account' }, 400);
    if (action !== 'update_credentials') return json({ error: 'Unknown action' }, 400);
    const username = String(body.username ?? '').trim().toLowerCase();
    const newPassword = String(body.newPassword ?? '');
    if (!username) return json({ error: 'Username is required' }, 400);
    if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) return json({ error: 'Username must be 3-50 characters and use only letters, numbers, dot, underscore or hyphen' }, 400);
    if (newPassword && newPassword.length < 6) return json({ error: 'Password must contain at least 6 characters' }, 400);
    const escaped = username.replace(/[%_\\]/g, c => '\\' + c);
    const { data: duplicate } = await adminClient.from('tenants').select('id').ilike('username', escaped).neq('id', tenantId).maybeSingle();
    if (duplicate) return json({ error: 'That username is already taken.' }, 409);
    const newEmail = `${username}@${LOGIN_DOMAIN}`;
    const authPatch: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (newEmail !== tenant.login_email) { authPatch.email = newEmail; authPatch.email_confirm = true; }
    if (newPassword) authPatch.password = newPassword;
    if (Object.keys(authPatch).length) {
      const { error } = await adminClient.auth.admin.updateUserById(tenant.profile_id, authPatch);
      if (error) return json({ error: error.message }, 500);
    }
    const { data: updated, error: updateErr } = await adminClient.from('tenants').update({ username, login_email: newEmail }).eq('id', tenantId).eq('owner_id', userResp.user.id).select('id, username, login_email, is_active').single();
    if (updateErr) return json({ error: updateErr.message }, 500);
    return json({ success: true, tenant: updated });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500); }
});
