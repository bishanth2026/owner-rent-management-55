import { createTenant } from './edgeFunctions.js';
import { listAllTenantsForOwner } from './tenants.js';

/**
 * Owner-triggered, idempotent, re-runnable migration of tenants that only
 * exist in the legacy local `tenants` array into real Supabase tenant +
 * Auth records. Never deletes anything from localStorage or from local
 * payment records — that stays entirely under the owner's control.
 */
export async function migrateLegacyTenants(localTenants) {
  const results = { migrated: [], skipped: [], failed: [] };

  if (!Array.isArray(localTenants) || localTenants.length === 0) {
    return results;
  }

  let existingUsernames;
  try {
    const existing = await listAllTenantsForOwner(true);
    existingUsernames = new Set(existing.map(t => (t.username || '').toLowerCase()));
  } catch (e) {
    throw new Error('Could not read existing Supabase tenants before migrating: ' + e.message);
  }

  for (const local of localTenants) {
    const username = String(local.username || '').trim().toLowerCase();

    if (!username) {
      results.failed.push({ local, reason: 'Local record has no username — cannot create a login.' });
      continue;
    }
    if (existingUsernames.has(username)) {
      results.skipped.push({ local, reason: 'A tenant with this username already exists in Supabase.' });
      continue;
    }
    if (!local.password) {
      results.failed.push({ local, reason: 'Local record has no password to migrate as the login password.' });
      continue;
    }
    if (!local.monthlyRent || Number(local.monthlyRent) <= 0) {
      results.failed.push({ local, reason: 'Missing or invalid monthly rent.' });
      continue;
    }
    if (!local.startDate) {
      results.failed.push({ local, reason: 'Missing rent start date.' });
      continue;
    }

    try {
      const response = await createTenant({
        username,
        password: local.password, // used once as the new Auth password, never persisted anywhere after this call
        name: local.name,
        unitLabel: local.unit || '',
        monthlyRent: Number(local.monthlyRent),
        rentStartDate: local.startDate,
      });
      results.migrated.push({ local, remote: response.tenant });
      existingUsernames.add(username); // guards against duplicate usernames within the same local batch
    } catch (e) {
      results.failed.push({ local, reason: e.message || 'Unknown error creating tenant.' });
    }
  }

  return results;
}