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

// Tenant-list WhatsApp column fix.
// The tenant table is rendered by the legacy page code in index.html.  Keep
// that code untouched and normalize only that table so older/duplicate
// WhatsApp columns can never accumulate.  The value is read directly from
// the same Supabase contact_number field already used by the tenant account.
let tenantListWhatsAppBusy = false;
let tenantListWhatsAppTimer = null;
let tenantListWhatsAppObserver = null;

async function syncTenantListWhatsAppColumn() {
  const tbody = document.getElementById('tRows');
  if (!tbody || !tbody.closest('table')) return;
  if (tenantListWhatsAppBusy) return;
  tenantListWhatsAppBusy = true;

  try {
    const table = tbody.closest('table');
    const headerRow = table.tHead && table.tHead.rows[0];
    if (!headerRow) return;

    // Remove every pre-existing WhatsApp header/cell column first. This is
    // what fixes the currently visible duplicate WhatsApp columns.
    const whatsappIndexes = [];
    Array.from(headerRow.cells).forEach((cell, index) => {
      if ((cell.textContent || '').trim().toLowerCase() === 'whatsapp') {
        whatsappIndexes.push(index);
      }
    });
    whatsappIndexes.sort((a, b) => b - a).forEach(index => {
      Array.from(table.rows).forEach(row => {
        if (row.cells[index]) row.deleteCell(index);
      });
    });

    // Re-read the header after cleanup and insert exactly one WhatsApp column
    // immediately after Login, preserving all existing columns and styling.
    const freshHeader = table.tHead.rows[0];
    let loginIndex = Array.from(freshHeader.cells).findIndex(
      cell => (cell.textContent || '').trim().toLowerCase() === 'login'
    );
    if (loginIndex < 0) loginIndex = Math.max(0, freshHeader.cells.length - 1);

    const whatsappHeader = freshHeader.insertCell(loginIndex + 1);
    whatsappHeader.outerHTML = '<th>WhatsApp</th>';

    // Fetch the same tenant records used by the tenant-management page.
    const rows = await listAllTenantsForOwner(true);
    const byUsername = new Map();
    rows.forEach(row => {
      const username = String(row.username || '').trim().toLowerCase();
      if (username) byUsername.set(username, row.contact_number || '');
    });

    Array.from(tbody.rows).forEach(row => {
      const cells = row.cells;
      if (!cells.length) return;
      const currentLoginIndex = Array.from(table.tHead.rows[0].cells).findIndex(
        cell => (cell.textContent || '').trim().toLowerCase() === 'login'
      );
      const loginCell = cells[currentLoginIndex];
      const username = loginCell ? (loginCell.textContent || '').trim().toLowerCase() : '';
      const number = byUsername.get(username) || '';
      const cell = row.insertCell(currentLoginIndex + 1);
      cell.textContent = number || 'Not saved';
    });
  } catch (error) {
    // Do not interfere with the existing tenant page if the optional display
    // lookup fails. The underlying tenant functions remain unchanged.
    console.warn('Could not sync tenant WhatsApp column:', error);
  } finally {
    tenantListWhatsAppBusy = false;
  }
}

function scheduleTenantListWhatsAppSync() {
  clearTimeout(tenantListWhatsAppTimer);
  tenantListWhatsAppTimer = setTimeout(() => syncTenantListWhatsAppColumn(), 80);
}

if (typeof window !== 'undefined') {
  const startTenantListWhatsAppSync = () => {
    const tbody = document.getElementById('tRows');
    if (!tbody) return;
    if (tenantListWhatsAppObserver) tenantListWhatsAppObserver.disconnect();
    tenantListWhatsAppObserver = new MutationObserver(() => scheduleTenantListWhatsAppSync());
    tenantListWhatsAppObserver.observe(tbody, { childList: true, subtree: true });
    scheduleTenantListWhatsAppSync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTenantListWhatsAppSync, { once: true });
  } else {
    startTenantListWhatsAppSync();
  }
}
