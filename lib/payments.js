import { supabase } from './supabaseClient.js';
import { fetchOwnTenantRecord } from './tenantAuth.js';

// public.payments is the cloud source of truth for ALL payment records —
// see phase7_payments.sql for the table definition, the
// prevent_payment_tenant_change trigger, and the RLS policies this module
// relies on. localStorage is never written to by this module; the old
// biznexco_rent_payments_v5 key is left untouched on disk purely as a
// historical/audit artifact of the pre-Phase-9 local-only architecture — see
// the comments in index.html's load()/save() for how that's handled.

const PAYMENT_SELECT_FIELDS =
  'id, tenant_id, owner_id, date, amount, bank, ref, note, status, created_at, updated_at';

// Fields a TENANT may change on their own payment record via
// updateOwnPayment(). Deliberately excludes tenant_id/owner_id/status —
// identity/ownership fields are blocked at the DB layer by the
// prevent_payment_tenant_change trigger (first layer: this whitelist,
// second/authoritative layer: the trigger + RLS WITH CHECK clauses).
const TENANT_EDITABLE_FIELDS = ['date', 'amount', 'bank', 'ref', 'note'];

// Fields an OWNER may change via ownerUpdatePayment(). Owners are also
// allowed to set `status` (e.g. marking a payment "Verified" after bank
// reconciliation review) — tenants are not.
const OWNER_EDITABLE_FIELDS = ['date', 'amount', 'bank', 'ref', 'note', 'status'];

function pickFields(patch, allowed) {
  const safe = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) safe[key] = patch[key];
  }
  return safe;
}

// Converts a Supabase payments row into the shape the EXISTING legacy
// render/math functions (accrued(), paid(), ownerLedger(), etc.) already
// expect: { id, tenantId, date, amount, bank, ref, note, status }. This is
// the one and only place that mapping happens, mirroring
// tenants.js's toLegacyTenantShape() and keeping every existing pure-math
// helper in index.html untouched.
export function toLegacyPaymentShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    date: row.date,
    amount: Number(row.amount) || 0,
    bank: row.bank || '',
    ref: row.ref || '',
    note: row.note || '',
    status: row.status || 'Recorded',
  };
}

/** Tenant submits a new payment against their own tenant record. */
export async function tenantSubmitPayment({ date, amount, bank, ref, note } = {}) {
  const tenantRecord = await fetchOwnTenantRecord();
  if (!tenantRecord) throw new Error('No active tenant account linked to this login.');
  if (!date || !(Number(amount) > 0)) throw new Error('A valid date and amount are required.');

  const { data, error } = await supabase
    .from('payments')
    .insert({
      tenant_id: tenantRecord.id,
      date,
      amount: Number(amount),
      bank: bank || null,
      ref: ref || null,
      note: note || null,
      status: 'Recorded',
    })
    .select(PAYMENT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** Tenant lists their own payment history. RLS restricts rows to their own tenant record. */
export async function tenantListOwnPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_FIELDS)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

/** Tenant edits one of their own payment records (contact/detail fields only — see TENANT_EDITABLE_FIELDS). */
export async function updateOwnPayment(id, patch = {}) {
  if (!id) throw new Error('Payment id is required.');
  const safePatch = pickFields(patch, TENANT_EDITABLE_FIELDS);
  if (Object.keys(safePatch).length === 0) throw new Error('No editable fields provided.');
  // Deliberately does NOT touch `status` here. `status` is not in
  // TENANT_EDITABLE_FIELDS (tenants can never set it — see task item #4),
  // and it must never be silently reset just because the tenant edited an
  // unrelated field like amount or note. Payment verification isn't part of
  // this app's workflow, but if an owner has manually set a payment's
  // status to something like "Verified" (e.g. via bank reconciliation), a
  // tenant correcting a typo in the note field must not downgrade it back
  // to "Recorded" out from under them (task item #5).

  const { data, error } = await supabase
    .from('payments')
    .update(safePatch)
    .eq('id', id)
    .select(PAYMENT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** Owner lists every payment across all of their tenants. RLS restricts rows to tenants they own. */
export async function ownerListPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT_FIELDS)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Owner creates a payment on behalf of one of their own tenants — this is
 * NOT one of the six originally-named functions, but is required by the
 * Bank Reconciliation "Add to Ledger" flow (task item #4): that action is
 * always owner-initiated (owner matching a bank credit to a tenant they
 * pick from a dropdown), never tenant-initiated, so it needs its own
 * owner-scoped insert path distinct from tenantSubmitPayment().
 */
export async function ownerSubmitPayment({ tenantId, date, amount, bank, ref, note, status } = {}) {
  if (!tenantId) throw new Error('A tenant must be selected.');
  if (!date || !(Number(amount) > 0)) throw new Error('A valid date and amount are required.');

  const { data, error } = await supabase
    .from('payments')
    .insert({
      tenant_id: tenantId,
      date,
      amount: Number(amount),
      bank: bank || null,
      ref: ref || null,
      note: note || null,
      status: status || 'Verified',
    })
    .select(PAYMENT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** Owner edits any payment belonging to one of their own tenants. */
export async function ownerUpdatePayment(id, patch = {}) {
  if (!id) throw new Error('Payment id is required.');
  const safePatch = pickFields(patch, OWNER_EDITABLE_FIELDS);
  if (Object.keys(safePatch).length === 0) throw new Error('No editable fields provided.');
  // Only touches `status` if the owner explicitly included it in `patch`
  // (status IS in OWNER_EDITABLE_FIELDS, so an owner-initiated status
  // change is legitimate) — never force-defaults it, so editing amount/
  // date/bank/ref/note alone can never silently downgrade a status the
  // owner previously set (task item #5).

  const { data, error } = await supabase
    .from('payments')
    .update(safePatch)
    .eq('id', id)
    .select(PAYMENT_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** Owner-only deletion, matching the app's existing UI design (only the owner Payments page ever showed a Delete button). RLS backs this up — see phase7_payments.sql. */
export async function ownerDeletePayment(id) {
  if (!id) throw new Error('Payment id is required.');
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
  return true;
}
