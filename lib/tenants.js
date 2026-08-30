import { supabase } from './supabaseClient.js';

const TENANT_SELECT_FIELDS =
  'id, profile_id, owner_id, property_id, unit_id, name, unit_label, monthly_rent, rent_start_date, username, login_email, contact_number, email, notes, is_active, created_at, updated_at';

const EDITABLE_FIELDS = ['name','property_id','unit_id','unit_label','monthly_rent','rent_start_date','contact_number','email','notes'];

export async function listActiveTenants() {
  const { data, error } = await supabase.from('tenants').select(TENANT_SELECT_FIELDS).eq('is_active', true).order('name', { ascending: true });
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
  const { data, error } = await supabase.from('tenants').select(TENANT_SELECT_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTenantEditableFields(id, patch) {
  if (!id) throw new Error('Tenant id is required.');
  const safePatch = {};
  for (const key of EDITABLE_FIELDS) if (Object.prototype.hasOwnProperty.call(patch, key)) safePatch[key] = patch[key];
  if (!Object.keys(safePatch).length) throw new Error('No editable fields provided.');
  const { data, error } = await supabase.from('tenants').update(safePatch).eq('id', id).select(TENANT_SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function deactivateTenant(id) {
  const { data, error } = await supabase.from('tenants').update({ is_active: false }).eq('id', id).select(TENANT_SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function reactivateTenant(id) {
  const { data, error } = await supabase.from('tenants').update({ is_active: true }).eq('id', id).select(TENANT_SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

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
    _source: 'supabase',
  };
}

// Tenant list display fix: exactly ONE WhatsApp column after Login.
// The number is read directly from tenants.contact_number. The observer is
// deliberately scoped and disconnected while it edits the table so its own
// DOM changes cannot recursively create duplicate columns.
let tenantListWhatsAppObserver = null;
let tenantListWhatsAppTimer = null;
let tenantListWhatsAppBusy = false;

function scheduleTenantListWhatsAppSync() {
  clearTimeout(tenantListWhatsAppTimer);
  tenantListWhatsAppTimer = setTimeout(syncTenantListWhatsAppColumn, 80);
}

async function syncTenantListWhatsAppColumn() {
  if (tenantListWhatsAppBusy) return;
  const tbody = document.getElementById('tRows');
  const table = tbody?.closest('table');
  if (!tbody || !table?.tHead?.rows?.[0]) return;

  tenantListWhatsAppBusy = true;
  const observer = tenantListWhatsAppObserver;
  try {
    if (observer) observer.disconnect();

    const header = table.tHead.rows[0];

    // Remove every existing WhatsApp header/cell first. This makes the
    // operation idempotent even when an older cached version added columns.
    const whatsappIndexes = Array.from(header.cells)
      .map((cell, index) => ({ index, text: (cell.textContent || '').trim().toLowerCase() }))
      .filter(x => x.text === 'whatsapp')
      .map(x => x.index)
      .sort((a, b) => b - a);

    whatsappIndexes.forEach(index => {
      Array.from(table.rows).forEach(row => {
        if (row.cells[index]) row.deleteCell(index);
      });
    });

    const freshHeader = table.tHead.rows[0];
    const loginIndex = Array.from(freshHeader.cells)
      .findIndex(cell => (cell.textContent || '').trim().toLowerCase() === 'login');
    if (loginIndex < 0) return;

    const cloudRows = await listAllTenantsForOwner(true);
    const numbersByUsername = new Map();
    const numbersById = new Map();
    cloudRows.forEach(row => {
      const number = String(row.contact_number || '').trim();
      if (row.id) numbersById.set(String(row.id), number);
      const username = String(row.username || '').trim().toLowerCase();
      if (username) numbersByUsername.set(username, number);
    });

    const whHeader = document.createElement('th');
    whHeader.textContent = 'WhatsApp';
    freshHeader.insertBefore(whHeader, freshHeader.cells[loginIndex + 1] || null);

    Array.from(tbody.rows).forEach(row => {
      const cells = Array.from(row.cells);
      const currentLoginIndex = Array.from(table.tHead.rows[0].cells)
        .findIndex(cell => (cell.textContent || '').trim().toLowerCase() === 'login');
      if (currentLoginIndex < 0 || !cells[currentLoginIndex]) return;

      const username = (cells[currentLoginIndex].textContent || '').trim().toLowerCase();
      const number = numbersByUsername.get(username) || '';
      const cell = document.createElement('td');
      cell.textContent = number || 'Not saved';
      row.insertBefore(cell, row.cells[currentLoginIndex + 1] || null);
    });
  } catch (error) {
    console.warn('Could not sync tenant WhatsApp column:', error);
  } finally {
    tenantListWhatsAppBusy = false;
    if (observer) {
      const main = document.getElementById('main');
      if (main) observer.observe(main, { childList: true, subtree: true });
    }
  }
}

function startTenantListWhatsAppSync() {
  const main = document.getElementById('main');
  if (!main) return;
  if (tenantListWhatsAppObserver) tenantListWhatsAppObserver.disconnect();
  tenantListWhatsAppObserver = new MutationObserver(() => {
    if (document.getElementById('tRows')) scheduleTenantListWhatsAppSync();
  });
  tenantListWhatsAppObserver.observe(main, { childList: true, subtree: true });
  scheduleTenantListWhatsAppSync();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTenantListWhatsAppSync, { once: true });
  } else {
    startTenantListWhatsAppSync();
  }
}
