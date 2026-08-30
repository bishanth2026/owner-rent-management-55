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
      .from('profiles').select('role').eq('id', userResp.user.id).single();
    if (!callerProfile || !['owner', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Only Owners or Super Admin can create tenants' }, 403);
    }

    const body = await req.json();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const { name, unitLabel, monthlyRent, rentStartDate, propertyId, unitId } = body;
    const contactNumber = String(body.contactNumber || '').trim();

    if (!username || !password || password.length < 6) {
      return json({ error: 'Username and a password of at least 6 characters are required' }, 400);
    }
    if (!name || !monthlyRent || !rentStartDate) {
      return json({ error: 'Name, monthly rent, and rent start date are required' }, 400);
    }

    // Owner accounts always create tenants under themselves. Super Admin can
    // choose the destination Owner explicitly from the tenant creation form.
    let ownerId = userResp.user.id;
    if (callerProfile.role === 'super_admin') {
      ownerId = String(body.ownerId || '').trim();
      if (!ownerId) return json({ error: 'Please select which Owner this tenant should be recorded under.' }, 400);

      const { data: selectedOwner, error: ownerErr } = await adminClient
        .from('profiles').select('id, role').eq('id', ownerId).maybeSingle();
      if (ownerErr || !selectedOwner || selectedOwner.role !== 'owner') {
        return json({ error: 'The selected Owner is invalid.' }, 400);
      }
    }

    const escapedUsername = username.replace(/[%_\\]/g, (c) => '\\' + c);
    const { data: existing } = await adminClient
      .from('tenants').select('id').ilike('username', escapedUsername).maybeSingle();
    if (existing) return json({ error: 'That username is already taken.' }, 409);

    const loginEmail = `${username}@${LOGIN_DOMAIN}`;

    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: { role: 'tenant' },
    });
    if (createErr) return json({ error: createErr.message }, 500);

    const { data: tenantRow, error: insertErr } = await adminClient
      .from('tenants')
      .insert({
        profile_id: newUser.user.id,
        owner_id: ownerId,
        property_id: propertyId || null,
        unit_id: unitId || null,
        name,
        unit_label: unitLabel || null,
        monthly_rent: monthlyRent,
        rent_start_date: rentStartDate,
        username,
        login_email: loginEmail,
        contact_number: contactNumber || null,
      })
      .select()
      .single();

    if (insertErr) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      if ((insertErr as { code?: string }).code === '23505') {
        return json({ error: 'That username is already taken.' }, 409);
      }
      return json({ error: insertErr.message }, 500);
    }

    return json({ success: true, tenant: tenantRow });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
