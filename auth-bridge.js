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
};
window.BiznexcoData = {
  listActiveTenants, listAllTenantsForOwner, getTenantById,
  updateTenantEditableFields, deactivateTenant, reactivateTenant,
  toLegacyTenantShape, migrateLegacyTenants,
  superAdminListProfiles, superAdminListTenants, superAdminListPayments, superAdminListProperties, superAdminListUnits,
};

// Tenant creation is owner-scoped. Owners continue to create tenants under
// their own account automatically. Super Admins must explicitly select the
// Owner under whom the new tenant record should be stored.
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

// Adds the Owner selector only to Super Admin tenant creation. Existing Owner
// tenant screens are intentionally left unchanged; their owner_id is derived
// securely by the Edge Function from the signed-in Owner session.
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

// Super Admin currently has a tenant list but no creation form. Add the form
// dynamically after that page is rendered so the existing dashboard markup,
// styling and navigation remain untouched.
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

  document.getElementById('superAdminAddT').onclick = async () => {
    const msg = document.getElementById('superAdminTenantMsg');
    const ownerId = document.getElementById('nOwner')?.value || '';
    const name = document.getElementById('nName')?.value.trim() || '';
    const unitLabel = document.getElementById('nUnit')?.value.trim() || '';
    const monthlyRent = Number(document.getElementById('nRent')?.value || 0);
    const rentStartDate = document.getElementById('nStart')?.value || '';
    const username = document.getElementById('nUser')?.value.trim() || '';
    const password = document.getElementById('nPass')?.value || '';
    const button = document.getElementById('superAdminAddT');
    if (!ownerId || !name || monthlyRent <= 0 || !rentStartDate || !username || !password) {
      msg.innerHTML = '<div class="notice error">Select an Owner and enter all required tenant fields.</div>';
      return;
    }
    if (password.length < 6) {
      msg.innerHTML = '<div class="notice error">Tenant password must be at least 6 characters.</div>';
      return;
    }
    button.disabled = true;
    try {
      await createTenantWithOwnerSelection({ ownerId, username, password, name, unitLabel, monthlyRent, rentStartDate });
      msg.innerHTML = '<div class="notice success">Tenant added successfully under the selected Owner.</div>';
      ['nName','nUnit','nRent','nStart','nUser','nPass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      await loadAdminDataForTenantFormRefresh();
    } catch (e) {
      msg.innerHTML = '<div class="notice error">' + String(e?.message || e).replace(/</g,'&lt;') + '</div>';
    } finally {
      button.disabled = false;
    }
  };
}

async function loadAdminDataForTenantFormRefresh() {
  // The existing page renderer owns the table refresh. Trigger its current
  // Tenants tab handler without introducing another navigation handler.
  const active = document.querySelector('#nav button[data-page="admin_tenants"]');
  if (active) await active.click();
}

// Keep the Super Admin entry point clearly labeled without taking over the
// existing navigation click handlers. The main app already binds each tab to
// renderPage(); this helper only changes the visible label.
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

    const observer = new MutationObserver(() => {
      if(apply()) observer.disconnect();
    });
    observer.observe(nav,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),10000);
  }catch(e){
    console.debug('Super Admin navigation label skipped:',e);
  }
}

window.addEventListener('biznexco-auth-ready',markSuperAdminNavigation);

supabase.auth.onAuthStateChange((event)=>{
  if(event === 'SIGNED_IN' || event === 'INITIAL_SESSION'){
    setTimeout(markSuperAdminNavigation,0);
  }
});

// One guarded observer handles only the tenant creation UI. It never rewrites
// existing nodes once they have been enhanced, preventing the old main-thread
// loop that caused Chrome's "Page Unresponsive" dialog.
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

window.dispatchEvent(new Event('biznexco-auth-ready'));
