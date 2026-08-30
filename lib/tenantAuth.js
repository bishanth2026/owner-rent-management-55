import { supabase } from './supabaseClient.js';

export async function tenantSignIn(username, password) {
  if (!username || !password) throw new Error('Enter your username and password.');

  const { data: loginEmail, error: lookupError } = await supabase
    .rpc('get_tenant_login_email', { p_username: username.trim() });

  if (lookupError || !loginEmail) throw new Error('Invalid username or password.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  });
  if (error) throw new Error('Invalid username or password.');

  const tenantRecord = await fetchOwnTenantRecord();
  if (!tenantRecord) {
    await supabase.auth.signOut();
    throw new Error('This account is not linked to an active tenant record.');
  }

  return { user: data.user, tenant: tenantRecord };
}

export async function tenantSignOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchOwnTenantRecord() {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return null;

  const { data, error } = await supabase
    .from('tenants')
    .select('id, owner_id, name, unit_label, monthly_rent, rent_start_date, username, is_active, contact_number, email, notes')
    .eq('profile_id', userResp.user.id)
    .eq('is_active', true)
    .single();

  if (error) return null;
  return data;
}

// Tenant self-update — calls the RPC in §B.4. Only contact fields, enforced server-side.
export async function updateOwnContactInfo({ contactNumber, email, notes } = {}) {
  const { data, error } = await supabase.rpc('update_own_tenant_contact_info', {
    p_contact_number: contactNumber || null,
    p_email: email || null,
    p_notes: notes || null,
  });
  if (error) throw error;
  return data;
}