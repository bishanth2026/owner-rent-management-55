import { supabase } from './supabaseClient.js';
import { fetchOwnProfile } from './ownerAuth.js';
import { fetchOwnTenantRecord } from './tenantAuth.js';

const PGK = 'biznexco_active_page_v2'; // same key the old app used — no data loss

export function getLastPage() { return localStorage.getItem(PGK); }
export function setLastPage(page) { if (page) localStorage.setItem(PGK, page); }
export function clearLastPage() { localStorage.removeItem(PGK); }

export async function restoreSession() {
  const { data: { session: authSession } } = await supabase.auth.getSession();
  if (!authSession) return null;
  return buildSessionFromAuthUser();
}

async function buildSessionFromAuthUser() {
  const profile = await fetchOwnProfile();
  if (!profile) return null;

  if (profile.role === 'super_admin') {
    return { role: 'super_admin', adminId: profile.id, lastPage: getLastPage() || 'admin_dashboard' };
  }
  if (profile.role === 'owner') {
    return { role: 'owner', ownerId: profile.id, lastPage: getLastPage() || 'dashboard' };
  }
  if (profile.role === 'tenant') {
    const tenantRecord = await fetchOwnTenantRecord();
    if (!tenantRecord) return null;
    return {
      role: 'tenant',
      tenantId: tenantRecord.id,
      ownerId: tenantRecord.owner_id,
      lastPage: getLastPage() || 'myaccount',
      _tenantRecord: tenantRecord, // used by the legacy-bridge in login(), see §A.11
    };
  }
  return null;
}

export function clearSession() { clearLastPage(); }