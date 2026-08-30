import { supabase } from './supabaseClient.js';

async function query(table, columns='*', orderBy='created_at', ascending=false) {
  let q = supabase.from(table).select(columns);
  if (orderBy) q = q.order(orderBy, { ascending });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function superAdminListProfiles() {
  return query('profiles', 'id, role, full_name, email', 'full_name', true);
}

export async function superAdminListTenants() {
  return query(
    'tenants',
    'id, owner_id, profile_id, name, unit_label, monthly_rent, rent_start_date, username, login_email, is_active, contact_number, email',
    'name',
    true
  );
}

export async function superAdminListPayments() {
  return query(
    'payments',
    'id, tenant_id, owner_id, date, amount, bank, ref, note, status, created_at, updated_at',
    'date',
    false
  );
}

export async function superAdminListProperties() {
  try {
    return await query('properties', 'id, owner_id, name, address, created_at, updated_at', 'name', true);
  } catch (_) {
    return [];
  }
}

export async function superAdminListUnits() {
  try {
    return await query('units', 'id, property_id, owner_id, label, created_at, updated_at', 'label', true);
  } catch (_) {
    return [];
  }
}

// Load the Super Admin edit/delete UI only after the main auth bridge has
// initialized its public API. This keeps Owner/Tenant screens unchanged.
setTimeout(() => {
  import('../super-admin-controls.js').catch((error) => {
    console.debug('Super Admin controls skipped:', error);
  });
}, 0);
