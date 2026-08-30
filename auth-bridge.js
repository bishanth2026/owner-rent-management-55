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

// Keep the existing Super Admin functionality and design unchanged, but make
// its entry point unmistakable. For a signed-in super_admin, the first admin
// navigation button is labeled "Super Admin" instead of the generic
// "Dashboard" label. This only changes the visible label; routing and all
// existing Owner/Tenant navigation remain untouched.
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
      if(first) first.textContent = 'Super Admin';
    };
    apply();
    if(!nav.__biznexcoSuperAdminObserver){
      nav.__biznexcoSuperAdminObserver = new MutationObserver(apply);
      nav.__biznexcoSuperAdminObserver.observe(nav,{childList:true,subtree:true});
    }
  }catch(e){
    // Navigation labeling must never interfere with authentication or app boot.
    console.debug('Super Admin navigation label skipped:',e);
  }
}

window.addEventListener('biznexco-auth-ready',markSuperAdminNavigation);
supabase.auth.onAuthStateChange((event)=>{
  if(event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(markSuperAdminNavigation,0);
});

window.dispatchEvent(new Event('biznexco-auth-ready'));
