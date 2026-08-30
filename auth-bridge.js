import { supabase } from './lib/supabaseClient.js';
import {
  ownerSignIn, ownerSignOut, ownerSignUp,
  ownerRequestPasswordReset, ownerCompletePasswordReset, fetchOwnProfile,
} from './lib/ownerAuth.js';
import {
  tenantSignIn, tenantSignOut, fetchOwnTenantRecord, updateOwnContactInfo,
} from './lib/tenantAuth.js';
import {
  restoreSession, clearSession, getLastPage, setLastPage, clearLastPage,
} from './lib/sessionManager.js';
import { initAuthListener } from './lib/authListener.js';
import { resetTenantPassword, createTenant as createTenantEdge, manageTenant, createOwner, manageOwner } from './lib/edgeFunctions.js';
import { superAdminListProfiles, superAdminListTenants, superAdminListPayments, superAdminListProperties, superAdminListUnits } from './lib/superAdmin.js';
import {
  listActiveTenants, listAllTenantsForOwner, getTenantById,
  updateTenantEditableFields, deactivateTenant, reactivateTenant,
  toLegacyTenantShape,
} from './lib/tenants.js';
import { migrateLegacyTenants } from './lib/legacyMigration.js';
import {
  tenantSubmitPayment, tenantListOwnPayments, updateOwnPayment,
  ownerListPayments, ownerSubmitPayment, ownerUpdatePayment, ownerDeletePayment,
  toLegacyPaymentShape,
} from './lib/payments.js';

window.BiznexcoAuth = {
  supabase,
  ownerSignIn, ownerSignOut, ownerSignUp, ownerRequestPasswordReset, ownerCompletePasswordReset, fetchOwnProfile,
  tenantSignIn, tenantSignOut, fetchOwnTenantRecord, updateOwnContactInfo,
  restoreSession, clearSession, getLastPage, setLastPage, clearLastPage,
  initAuthListener,
  resetTenantPassword, manageTenant, createOwner, manageOwner,
  // Payment APIs used by the tenant and owner portal pages.
  tenantSubmitPayment, tenantListOwnPayments, updateOwnPayment,
  ownerListPayments, ownerSubmitPayment, ownerUpdatePayment, ownerDeletePayment,
  toLegacyPaymentShape,
};

// Compatibility bridge for the existing index.html payment handlers.
// The payment module was already imported correctly above, but the page calls
// window.BiznexcoPayments.*. Expose the same functions under that namespace
// without changing any payment UI, database logic, or existing handlers.
window.BiznexcoPayments = {
  tenantSubmitPayment, tenantListOwnPayments, updateOwnPayment,
  ownerListPayments, ownerSubmitPayment, ownerUpdatePayment, ownerDeletePayment,
  toLegacyPaymentShape,
};

window.BiznexcoData = {
  listActiveTenants, listAllTenantsForOwner, getTenantById,
  updateTenantEditableFields, deactivateTenant, reactivateTenant,
  toLegacyTenantShape, migrateLegacyTenants,
  superAdminListProfiles, superAdminListTenants, superAdminListPayments, superAdminListProperties, superAdminListUnits,
};

async function createTenantWithOwnerSelection(tenantData = {}) {
  let ownerId = tenantData.ownerId || '';
  try {
    const profile = await fetchOwnProfile();
    if (profile?.role === 'super_admin') {
      const select = document.getElementById('nOwner');
      ownerId = select?.value || ownerId;
      if (!ownerId) throw new Error('Please select which Owner this tenant should be recorded under.');
    }
  } catch (e) {
    if (e?.message?.includes('Please select')) throw e;
  }
  return createTenantEdge({ ...tenantData, ownerId: ownerId || undefined });
}
window.BiznexcoAuth.createTenant = createTenantWithOwnerSelection;

async function populateTenantOwnerSelector() {
  const select = document.getElementById('nOwner');
  if (!select || select.dataset.loaded === '1') return;
  select.dataset.loaded = 'loading';
  try {
    const profiles = await superAdminListProfiles();
    const owners = (profiles || []).filter(p => p.role === 'owner');
    select.innerHTML = '<option value="">Select Owner</option>' + owners.map(p => {
      const id = String(p.id || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const label = String(p.full_name || p.email || 'Owner').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const email = p.email && p.full_name ? ' — ' + String(p.email).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
      return `<option value="${id}">${label}${email}</option>`;
    }).join('');
    select.dataset.loaded = '1';
  } catch (e) {
    select.dataset.loaded = '0';
    select.innerHTML = '<option value="">Unable to load Owners</option>';
    console.error('Unable to load tenant Owners:', e);
  }
}

async function enhanceTenantCreationUI() {
  const addButton = document.getElementById('addT');
  const nameInput = document.getElementById('nName');
  if (!addButton || !nameInput || document.getElementById('nOwnerWrap')) return;
  let profile;
  try { profile = await fetchOwnProfile(); } catch (_) { return; }
  if (profile?.role !== 'super_admin') return;

  const ownerWrap = document.createElement('div');
  ownerWrap.id = 'nOwnerWrap';
  ownerWrap.innerHTML = '<label for="nOwner">Record Tenant Under Owner</label><select id="nOwner" required><option value="">Loading Owners…</option></select>';
  const firstFormGrid = nameInput.closest('.formgrid');
  if (firstFormGrid) firstFormGrid.insertBefore(ownerWrap, firstFormGrid.firstElementChild);
  else addButton.parentElement?.before(ownerWrap);
  await populateTenantOwnerSelector();
}

async function ensureSuperAdminTenantCreateForm() {
  const heading = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.trim() === 'Tenants');
  if (!heading || document.getElementById('superAdminAddTenantCard')) return;
  let profile;
  try { profile = await fetchOwnProfile(); } catch (_) { return; }
  if (profile?.role !== 'super_admin') return;

  const card = document.createElement('div');
  card.id = 'superAdminAddTenantCard';
  card.className = 'card';
  card.innerHTML = `<h3 style="margin-top:0">Add Tenant</h3>
    <div class="muted" style="margin-bottom:10px">Choose the Owner under whom this tenant record must be stored.</div>
    <div class="formgrid">
      <div><label>Record Tenant Under Owner</label><select id="nOwner" required><option value="">Loading Owners…</option></select></div>
      <div><label>Tenant Name</label><input id="nName"></div>
      <div><label>Unit / Shop</label><input id="nUnit"></div>
    </div>
    <div class="formgrid" style="margin-top:10px">
      <div><label>Monthly Fixed Rent</label><input id="nRent" type="number"></div>
      <div><label>Rent Starting Date</label><input id="nStart" type="date"></div>
      <div><label>Tenant Username</label><input id="nUser"></div>
    </div>
    <div class="formgrid" style="margin-top:10px">
      <div><label>Tenant Password (min 6 characters)</label><input id="nPass" type="text"></div>
    </div>
    <div id="superAdminTenantMsg"></div>
    <div class="actions"><button type="button" class="primary" id="superAdminAddT">Add Tenant</button></div>`;
  const existingCard = heading.parentElement?.nextElementSibling;
  if (existingCard) existingCard.before(card); else heading.parentElement?.after(card);
  await populateTenantOwnerSelector();

  const button = document.getElementById('superAdminAddT');
  if (button) button.onclick = () => handleTenantCreateClick(button, true);
}

async function loadAdminDataForTenantFormRefresh() {
  const active = document.querySelector('#nav button[data-page="admin_tenants"]');
  if (active) await active.click();
}

async function handleTenantCreateClick(button, isSuperAdminButton = false) {
  const get = id => document.getElementById(id);
  const msg = get(isSuperAdminButton ? 'superAdminTenantMsg' : 'tm');
  const ownerId = get('nOwner')?.value || '';
  const name = get('nName')?.value.trim() || '';
  const unitLabel = get('nUnit')?.value.trim() || '';
  const monthlyRent = Number(get('nRent')?.value || 0);
  const rentStartDate = get('nStart')?.value || '';
  const username = get('nUser')?.value.trim() || '';
  const password = get('nPass')?.value || '';

  const show = (text, cls) => {
    if (msg) msg.innerHTML = `<div class="notice ${cls}">${String(text).replace(/</g,'&lt;')}</div>`;
  };
  if ((isSuperAdminButton && !ownerId) || !name || monthlyRent <= 0 || !rentStartDate || !username || !password) {
    show(isSuperAdminButton ? 'Select an Owner and enter all required tenant fields.' : 'Enter all tenant fields.', 'error');
    return;
  }
  if (password.length < 6) {
    show('Tenant password must be at least 6 characters.', 'error');
    return;
  }

  button.disabled = true;
  try {
    await createTenantWithOwnerSelection({
      ownerId: ownerId || undefined,
      username, password, name, unitLabel, monthlyRent, rentStartDate,
    });
    show(isSuperAdminButton ? 'Tenant added successfully under the selected Owner.' : 'Tenant added successfully.', 'success');
    ['nName','nUnit','nRent','nStart','nUser','nPass'].forEach(id => { const el = get(id); if (el) el.value = ''; });
    if (isSuperAdminButton) {
      await loadAdminDataForTenantFormRefresh();
    } else if (typeof window.refreshLocalTenantCache === 'function') {
      await window.refreshLocalTenantCache();
      const refresh = document.querySelector('#nav button[data-page="tenants"]');
      if (refresh) await refresh.click();
    } else {
      window.dispatchEvent(new Event('biznexco-tenant-created'));
    }
  } catch (e) {
    show(e?.message || 'Could not add tenant.', 'error');
  } finally {
    button.disabled = false;
  }
}

// The tenant page is rendered dynamically. This delegated fallback guarantees
// that the Add Tenant control remains functional even if a render replaces its
// original handler. It intercepts only the tenant-create buttons and leaves
// every other control untouched.
document.addEventListener('click', (event) => {
  const target = event.target?.closest?.('#addT, #superAdminAddT');
  if (!target || target.dataset.biznexcoHandled === '1') return;
  if (target.id === 'addT' && typeof target.onclick === 'function') return;
  event.preventDefault();
  event.stopPropagation();
  target.dataset.biznexcoHandled = '1';
  handleTenantCreateClick(target, target.id === 'superAdminAddT').finally(() => {
    delete target.dataset.biznexcoHandled;
  });
}, true);

async function markSuperAdminNavigation(){
  try{
    const {data:{user}} = await supabase.auth.getUser();
    if(!user) return;
    const profile = await fetchOwnProfile();
    if(!profile || profile.role !== 'super_admin') return;
    const nav = document.getElementById('nav');
    if(!nav) return;
    const apply = () => {
      const first = nav.querySelector('button[data-page="admin_dashboard"]');
      if(!first) return false;
      if(first.textContent !== 'Super Admin') first.textContent = 'Super Admin';
      return true;
    };
    if(apply()) return;
    const observer = new MutationObserver(() => { if(apply()) observer.disconnect(); });
    observer.observe(nav,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),10000);
  }catch(e){ console.debug('Super Admin navigation label skipped:',e); }
}

function ensureSuperAdminLoginEntry(){
  const roleBox = document.querySelector('.login-role');
  if(!roleBox || document.getElementById('superAdminLoginBtn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'superAdminLoginBtn';
  btn.textContent = '🛡️ Super Admin Login';
  btn.style.cssText = 'grid-column:1 / -1;width:100%;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;padding:11px;font-weight:800;color:#475569;cursor:pointer;';
  btn.addEventListener('click',()=>{ window.location.href = './super-admin.html'; });
  roleBox.appendChild(btn);
}

window.addEventListener('biznexco-auth-ready',markSuperAdminNavigation);
supabase.auth.onAuthStateChange((event)=>{
  if(event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(markSuperAdminNavigation,0);
});

const tenantUIObserver = new MutationObserver(() => {
  enhanceTenantCreationUI();
  ensureSuperAdminTenantCreateForm();
});
const startTenantUIObserver = () => {
  const main = document.getElementById('main');
  if (main) tenantUIObserver.observe(main,{childList:true,subtree:true});
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',startTenantUIObserver,{once:true});
else startTenantUIObserver();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureSuperAdminLoginEntry, { once:true });
else ensureSuperAdminLoginEntry();

window.dispatchEvent(new Event('biznexco-auth-ready'));
