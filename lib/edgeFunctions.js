import { supabase } from './supabaseClient.js';

async function invoke(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) {
    let message = error.message || 'Request failed';
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch (_) { /* fall back to generic message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const resetTenantPassword = (tenantId, newPassword) =>
  invoke('reset-tenant-password', { tenantId, newPassword });

export const manageTenant = (action, payload) =>
  invoke('manage-tenant', { action, ...payload });

export const createTenant = (tenantData) =>
  invoke('create-tenant', tenantData);
export const createOwner = (ownerData) => invoke('create-owner', ownerData);
export const manageOwner = (action, payload) => invoke('manage-owner', { action, ...payload });

export const manageAdminTenant = (action, payload) => invoke('manage-admin-tenant', { action, ...payload });
