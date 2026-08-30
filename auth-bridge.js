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
import { resetTenantPassword, createTenant, manageTenant, createOwner, manageOwner } from './lib/edgeFunctions.js';
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
  resetTenantPassword, createTenant, manageTenant, createOwner, manageOwner,
};
window.BiznexcoData = {
  listActiveTenants, listAllTenantsForOwner, getTenantById,
  updateTenantEditableFields, deactivateTenant, reactivateTenant,
  toLegacyTenantShape, migrateLegacyTenants,
  superAdminListProfiles, superAdminListTenants, superAdminListPayments, superAdminListProperties, superAdminListUnits,
};
window.BiznexcoPayments = {
  tenantSubmitPayment, tenantListOwnPayments, updateOwnPayment,
  ownerListPayments, ownerSubmitPayment, ownerUpdatePayment, ownerDeletePayment,
  toLegacyPaymentShape,
};

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

    // The navigation is created after authentication is restored. Wait for
    // that one DOM insertion only; do not observe/rewrite the button forever.
    const observer = new MutationObserver(() => {
      if(apply()) observer.disconnect();
    });
    observer.observe(nav,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),10000);
  }catch(e){
    // Navigation labeling must never interfere with authentication or app boot.
    console.debug('Super Admin navigation label skipped:',e);
  }
}

// Add a discreet Super Admin login entry to the public login screen.
// This does not alter Owner/Tenant authentication or navigation handlers.
function addSuperAdminLoginLink(){
  try{
    const loginCard = document.querySelector('#login .login-card');
    if(!loginCard || loginCard.querySelector('[data-super-admin-login-link]')) return;

    const link = document.createElement('a');
    link.href = './super-admin.html';
    link.textContent = 'Super Admin Login';
    link.setAttribute('data-super-admin-login-link','true');
    link.style.cssText = 'display:block;text-align:center;margin-top:16px;color:#1d4ed8;font-size:12px;font-weight:700;text-decoration:none;cursor:pointer;';
    link.addEventListener('mouseenter',()=>{link.style.textDecoration='underline';});
    link.addEventListener('mouseleave',()=>{link.style.textDecoration='none';});
    loginCard.appendChild(link);
  }catch(e){
    console.debug('Super Admin login link skipped:',e);
  }
}

// The previous implementation installed a capture-phase click handler that
// stopped the app's normal tab handlers and forced a full index.html reload.
// That caused Super Admin tabs to appear non-functional. It also used a
// MutationObserver that repeatedly rewrote the same button text, which could
// keep Chrome's main thread busy and produce "Page Unresponsive".
// The normal buildNav()/renderPage() handlers are now the only tab handlers.
window.addEventListener('biznexco-auth-ready',markSuperAdminNavigation);
window.addEventListener('DOMContentLoaded',addSuperAdminLoginLink);
setTimeout(addSuperAdminLoginLink,500);

supabase.auth.onAuthStateChange((event)=>{
  if(event === 'SIGNED_IN' || event === 'INITIAL_SESSION'){
    setTimeout(markSuperAdminNavigation,0);
  }
});

window.dispatchEvent(new Event('biznexco-auth-ready'));
