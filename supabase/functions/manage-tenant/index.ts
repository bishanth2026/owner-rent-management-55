import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOGIN_DOMAIN = 'tenants.biznexco.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanUsername(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function validUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,49}$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResp, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userResp?.user) return json({ error: 'Invalid session' }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userResp.user.id)
      .single();
    if (!callerProfile || callerProfile.role !== 'owner') {
      return json({ error: 'Only owners can manage tenants' }, 403);
    }

    const body = await req.json();
    const action = String(body.action || '');
    const tenantId = String(body.tenantId || '');
    if (!tenantId) return json({ error: 'Tenant id is required' }, 400);

    const { data: tenant, error: tenantErr } = await adminClient
      .from('tenants')
      .select('id, profile_id, owner_id, username, login_email, is_active')
      .eq('id', tenantId)
      .eq('owner_id', userResp.user.id)
      .single();
    if (tenantErr || !tenant) {
      return json({ error: 'Tenant not found or not owned by this account' }, 404);
    }
    if (!tenant.profile_id) {
      return json({ error: 'This tenant has no linked login account' }, 400);
    }

    // Support both the existing deployed action and the new Edit Tenant action.
    if (action === 'update_account' || action === 'update_credentials') {
      const username = cleanUsername(body.username);
      const newPassword = String(body.newPassword ?? '');

      if (!validUsername(username)) {
        return json({ error: 'Username must be 3-50 characters and use only letters, numbers, dot, underscore, or hyphen.' }, 400);
      }
      if (newPassword && newPassword.length < 6) {
        return json({ error: 'Password must contain at least 6 characters.' }, 400);
      }

      const escapedUsername = username.replace(/[%_\\]/g, (c: string) => '\\' + c);
      const { data: duplicate } = await adminClient
        .from('tenants')
        .select('id')
        .ilike('username', escapedUsername)
        .neq('id', tenantId)
        .maybeSingle();
      if (duplicate) return json({ error: 'That username is already taken.' }, 409);

      const oldUsername = String(tenant.username || '').toLowerCase();
      const oldEmail = tenant.login_email || `${oldUsername}@${LOGIN_DOMAIN}`;
      const newEmail = `${username}@${LOGIN_DOMAIN}`;
      const authUpdate: Record<string, unknown> = {};
      if (newEmail !== oldEmail) {
        authUpdate.email = newEmail;
        authUpdate.email_confirm = true;
      }
      if (newPassword) authUpdate.password = newPassword;

      if (Object.keys(authUpdate).length) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(
          tenant.profile_id,
          authUpdate,
        );
        if (authErr) return json({ error: authErr.message }, 400);
      }

      const { error: tenantUpdateErr } = await adminClient
        .from('tenants')
        .update({ username, login_email: newEmail })
        .eq('id', tenantId)
        .eq('owner_id', userResp.user.id);

      if (tenantUpdateErr) {
        if (newEmail !== oldEmail) {
          await adminClient.auth.admin.updateUserById(tenant.profile_id, { email: oldEmail });
        }
        return json({ error: tenantUpdateErr.message }, 500);
      }

      return json({
        success: true,
        username,
        loginEmail: newEmail,
        passwordChanged: !!newPassword,
      });
    }

    if (action === 'deactivate') {
      const { error } = await adminClient
        .from('tenants')
        .update({ is_active: false })
        .eq('id', tenantId)
        .eq('owner_id', userResp.user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, deactivated: true });
    }

    if (action === 'reactivate') {
      const { error } = await adminClient
        .from('tenants')
        .update({ is_active: true })
        .eq('id', tenantId)
        .eq('owner_id', userResp.user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, reactivated: true });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});