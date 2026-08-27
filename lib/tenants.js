import { supabase } from './supabaseClient.js';

const TENANT_SELECT_FIELDS =
  'id, profile_id, owner_id, property_id, unit_id, name, unit_label, monthly_rent, rent_start_date, username, login_email, contact_number, email, notes, is_active, created_at, updated_at';

// Fields an owner may change via updateTenantEditableFields(). Deliberately
// excludes username, login_email, profile_id, owner_id — those are the
// tenant's login identity / ownership fields. Excluding them here is the
// FIRST layer of protection; the prevent_tenant_identity_field_changes
// database trigger (see SQL section) is the second, authoritative layer.
const EDITABLE_FIELDS = [
  'name',
  'property_id',
  'unit_id',
  'unit_label',
  'monthly_rent',
  'rent_start_date',
  'contact_number',
  'email',
  'notes',
];

export async function listActiveTenants() {
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_SELECT_FIELDS)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listAllTenantsForOwner(includeInactive = true) {
  let query = supabase.from('tenants').select(TENANT_SELECT_FIELDS).order('name', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getTenantById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTenantEditableFields(id, patch) {
  if (!id) throw new Error('Tenant id is required.');

  const safePatch = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      safePatch[key] = patch[key];
    }
  }
  if (Object.keys(safePatch).length === 0) {
    throw new Error('No editable fields provided.');
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(safePatch)
    .eq('id', id)
    .select(TENANT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateTenant(id) {
  const { data, error } = await supabase
    .from('tenants')
    .update({ is_active: false })
    .eq('id', id)
    .select(TENANT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function reactivateTenant(id) {
  const { data, error } = await supabase
    .from('tenants')
    .update({ is_active: true })
    .eq('id', id)
    .select(TENANT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

// Converts a Supabase tenant row into the shape the EXISTING legacy render
// functions (accrued(), paid(), ownerDashboard(), ownerLedger(), etc.)
// already expect: { id, name, unit, monthlyRent, startDate, username }.
// This is the one and only place that mapping happens — nothing else in
// the app needs to know Supabase's column names.
export function toLegacyTenantShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    unit: row.unit_label || '',
    monthlyRent: Number(row.monthly_rent),
    startDate: row.rent_start_date,
    username: row.username,
    isActive: row.is_active,
    contactNumber: row.contact_number || '',
    email: row.email || '',
    notes: row.notes || '',
    // password intentionally omitted — never present for Supabase-backed tenants
    _source: 'supabase', // marks this record as Supabase-derived so the local
                          // cache (refreshLocalTenantCache) can safely drop it
                          // if it later disappears from listActiveTenants(),
                          // without ever discarding genuine not-yet-migrated
                          // legacy-local-only tenant records (which have no
                          // _source tag at all).
  };
}