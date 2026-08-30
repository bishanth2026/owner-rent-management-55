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

// Tenant list display fix: keep exactly ONE WhatsApp column after Login.
// The value comes directly from tenants.contact_number. The observer watches
// the document because the main page creates/recreates #tRows dynamically.
let tenantListWhatsAppBusy = false;
let tenantListWhatsAppTimer = null;
let tenantListWhatsAppObserver = null;
let tenantListWhatsAppSuppressUntil = 0;

async function syncTenantListWhatsAppColumn() {
  const tbody = document.getElementById('tRows');
  if (!tbody || !tbody.closest('table') || tenantListWhatsAppBusy) return;
  tenantListWhatsAppBusy = true;
  tenantListWhatsAppSuppressUntil = Date.now() + 700;
  try {
    const table = tbody.closest('table');
    const header = table.tHead && table.tHead.rows[0];
    if (!header) return;

    // Remove all old/duplicate WhatsApp columns.
    const indexes = Array.from(header.cells).map((c,i)=>({i,t:(c.textContent||'').trim().toLowerCase()})).filter(x=>x.t==='whatsapp').map(x=>x.i).sort((a,b)=>b-a);
    indexes.forEach(i=>Array.from(table.rows).forEach(r=>{ if(r.cells[i]) r.deleteCell(i); }));

    const freshHeader = table.tHead.rows[0];
    const loginIndex = Array.from(freshHeader.cells).findIndex(c=>(c.textContent||'').trim().toLowerCase()==='login');
    if (loginIndex < 0) return;

    const wh = document.createElement('th');
    wh.textContent = 'WhatsApp';
    freshHeader.insertBefore(wh, freshHeader.cells[loginIndex+1] || null);

    const cloudRows = await listAllTenantsForOwner(true);
    const numbers = new Map();
    cloudRows.forEach(r=>{
      const u=String(r.username||'').trim().toLowerCase();
      if(u) numbers.set(u,String(r.contact_number||'').trim());
    });

    Array.from(tbody.rows).forEach(row=>{
      const li=Array.from(table.tHead.rows[0].cells).findIndex(c=>(c.textContent||'').trim().toLowerCase()==='login');
      if(li<0 || !row.cells[li]) return;
      const username=(row.cells[li].textContent||'').trim().toLowerCase();
      const cell=document.createElement('td');
      cell.textContent=numbers.get(username)||'Not saved';
      row.insertBefore(cell,row.cells[li+1]||null);
    });
  } catch(error) {
    console.warn('Could not sync tenant WhatsApp column:', error);
  } finally {
    tenantListWhatsAppBusy=false;
  }
}

function scheduleTenantListWhatsAppSync(){
  clearTimeout(tenantListWhatsAppTimer);
  tenantListWhatsAppTimer=setTimeout(syncTenantListWhatsAppColumn,100);
}

if(typeof window!=='undefined' && typeof document!=='undefined'){
  const start=()=>{
    if(tenantListWhatsAppObserver) tenantListWhatsAppObserver.disconnect();
    tenantListWhatsAppObserver=new MutationObserver(()=>{
      if(Date.now()<tenantListWhatsAppSuppressUntil) return;
      if(document.getElementById('tRows')) scheduleTenantListWhatsAppSync();
    });
    tenantListWhatsAppObserver.observe(document.body,{childList:true,subtree:true});
    scheduleTenantListWhatsAppSync();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
