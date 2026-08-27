-- ============================================
-- RLS BASELINE — profiles, tenants, properties, units,
--                bank_transactions, reconciliation_matches, audit_logs
-- ============================================
-- Companion to phase5.sql, phase6_identity_guard.sql, and
-- phase7_payments.sql (which contains payments' own RLS policies).
--
-- IMPORTANT — READ BEFORE RUNNING:
-- This project's SQL files contain trigger/function/RPC definitions for
-- profiles and tenants, but NO CREATE POLICY statements were found anywhere
-- in the project prior to this file — RLS was previously either unset or
-- defined outside these files and never captured here. Section A and B
-- below are written against the actual columns referenced by
-- lib/ownerAuth.js, lib/tenantAuth.js, lib/tenants.js, and the Edge
-- Functions in this project, so they are authoritative for those two
-- tables.
--
-- Sections C–F (properties, units, bank_transactions,
-- reconciliation_matches, audit_logs) are NOT currently used by any code
-- in this project — the app only references tenants.property_id /
-- tenants.unit_id as nullable forward-compatible columns (see
-- lib/tenants.js), and bank_transactions/reconciliation_matches are only
-- mentioned as a future direction, never as live tables (bank statement
-- data is currently kept in browser localStorage only — see index.html's
-- `bankRows`, task item #4). Because no DDL for these five tables exists
-- anywhere in this project's visible files, the CREATE TABLE statements
-- below are a reasonable minimal schema inferred from how the app *would*
-- use them, clearly marked below. Review and adjust column names/types to
-- match your actual schema before running this section if it differs.

-- ============================================
-- A. profiles
-- ============================================
alter table public.profiles enable row level security;

-- A user may read only their own profile row. There is deliberately no
-- policy allowing an owner to read arbitrary other profiles from the
-- client — the create-tenant / reset-tenant-password Edge Functions
-- perform their owner-role checks with the service-role client, which
-- bypasses RLS entirely, so they never depend on this policy.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

-- A user may update only their own row. Role escalation is blocked by the
-- prevent_role_self_escalation trigger (phase5.sql) even though this
-- policy would otherwise permit a same-row update — the trigger is the
-- authoritative guard for the `role` column specifically.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- No INSERT policy for authenticated/anon — profile rows are created
-- exclusively by the handle_new_auth_user() trigger (SECURITY DEFINER,
-- runs as the table owner regardless of RLS) on new auth.users rows.
-- No DELETE policy at all — profiles are never deleted by the app.

-- ============================================
-- B. tenants
-- ============================================
alter table public.tenants enable row level security;

-- Owner sees every tenant they own, active or inactive (needed for
-- ownerTenants()'s Reactivate flow, which lists inactive tenants too).
drop policy if exists tenants_owner_select_own on public.tenants;
create policy tenants_owner_select_own on public.tenants
for select to authenticated
using (owner_id = auth.uid());

-- A tenant may see only their own row.
drop policy if exists tenants_self_select_own on public.tenants;
create policy tenants_self_select_own on public.tenants
for select to authenticated
using (profile_id = auth.uid());

-- No INSERT policy for authenticated/anon at all. Tenant creation is
-- exclusively via the create-tenant Edge Function's service-role client
-- (RLS-bypassing by design) — see supabase/functions/create-tenant/index.ts.
-- This intentionally blocks `supabase.from('tenants').insert(...)` from
-- ever succeeding directly from a browser, even for an authenticated owner.

-- Owner may update editable fields on tenants they own. The
-- prevent_tenant_identity_field_changes trigger (phase6_identity_guard.sql)
-- is the authoritative block on username/login_email/profile_id/owner_id —
-- this policy's job is only to scope *which rows* an owner may touch at
-- all, not which columns.
drop policy if exists tenants_owner_update_own on public.tenants;
create policy tenants_owner_update_own on public.tenants
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Tenants do NOT get a general self-update RLS policy. A blanket
-- "profile_id = auth.uid()" USING/WITH CHECK policy would let a tenant
-- directly call supabase.from('tenants').update({...}) and change ANY
-- column on their own row from the browser — including monthly_rent,
-- is_active, rent_start_date, property_id, unit_id — none of which the
-- phase6 identity-guard trigger protects (it only blocks
-- username/login_email/profile_id/owner_id). That is a real privilege
-- escalation path: a tenant could set their own monthly_rent to 0, or
-- reactivate/deactivate themselves.
--
-- Instead, tenant self-service goes exclusively through
-- update_own_tenant_contact_info() (phase5.sql section D) — a SECURITY
-- DEFINER RPC that only ever writes contact_number/email/notes, resolves
-- the caller's own tenant row server-side via profile_id = auth.uid(), and
-- is unreachable for any other column no matter what the client sends. No
-- RLS UPDATE policy is needed to support it (SECURITY DEFINER functions run
-- with the definer's privileges, bypassing RLS on the underlying table),
-- and no such policy should be added — doing so would reopen this exact
-- gap. If tenant self-service ever needs a new editable field, add it to
-- that RPC's explicit column list, not to a general UPDATE policy here.

-- No DELETE policy at all — the app only ever soft-deletes via
-- deactivateTenant() (an UPDATE setting is_active = false), never a real
-- DELETE. No client, owner or tenant, can hard-delete a tenants row.

-- ============================================
-- C. properties  (ASSUMED MINIMAL SCHEMA — see note above)
-- ============================================
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.properties enable row level security;

drop policy if exists properties_owner_select_own on public.properties;
create policy properties_owner_select_own on public.properties
for select to authenticated using (owner_id = auth.uid());

drop policy if exists properties_owner_insert_own on public.properties;
create policy properties_owner_insert_own on public.properties
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists properties_owner_update_own on public.properties;
create policy properties_owner_update_own on public.properties
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists properties_owner_delete_own on public.properties;
create policy properties_owner_delete_own on public.properties
for delete to authenticated using (owner_id = auth.uid());

-- ============================================
-- D. units  (ASSUMED MINIMAL SCHEMA — see note above)
-- ============================================
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.units enable row level security;

drop policy if exists units_owner_select_own on public.units;
create policy units_owner_select_own on public.units
for select to authenticated using (owner_id = auth.uid());

drop policy if exists units_owner_insert_own on public.units;
create policy units_owner_insert_own on public.units
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists units_owner_update_own on public.units;
create policy units_owner_update_own on public.units
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists units_owner_delete_own on public.units;
create policy units_owner_delete_own on public.units
for delete to authenticated using (owner_id = auth.uid());

-- ============================================
-- E. bank_transactions  (ASSUMED MINIMAL SCHEMA — see note above)
-- ============================================
-- NOT currently used by the app — bank statement rows are parsed and kept
-- entirely in browser memory/localStorage (index.html's `bankRows`) per
-- task item #4's explicit allowance ("Bank statement may remain local
-- temporarily"). This table + policies exist here only so that if/when the
-- app is upgraded to persist imported bank statements to the cloud, the
-- RLS is already correct and owner-scoped.
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  date date not null,
  description text,
  ref text,
  credit numeric(12,2) default 0,
  debit numeric(12,2) default 0,
  created_at timestamptz not null default now()
);
alter table public.bank_transactions enable row level security;

drop policy if exists bank_tx_owner_select_own on public.bank_transactions;
create policy bank_tx_owner_select_own on public.bank_transactions
for select to authenticated using (owner_id = auth.uid());

drop policy if exists bank_tx_owner_insert_own on public.bank_transactions;
create policy bank_tx_owner_insert_own on public.bank_transactions
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists bank_tx_owner_update_own on public.bank_transactions;
create policy bank_tx_owner_update_own on public.bank_transactions
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists bank_tx_owner_delete_own on public.bank_transactions;
create policy bank_tx_owner_delete_own on public.bank_transactions
for delete to authenticated using (owner_id = auth.uid());

-- ============================================
-- F. reconciliation_matches  (ASSUMED MINIMAL SCHEMA — see note above)
-- ============================================
-- Same status as bank_transactions: not currently used by the app (today's
-- reconcileRows() matching runs entirely client-side, in memory, against
-- the payments cloud cache + local bankRows). Scaffolded for the same
-- future-upgrade reason.
create table if not exists public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'Unmatched',
  created_at timestamptz not null default now()
);
alter table public.reconciliation_matches enable row level security;

drop policy if exists recon_owner_select_own on public.reconciliation_matches;
create policy recon_owner_select_own on public.reconciliation_matches
for select to authenticated using (owner_id = auth.uid());

drop policy if exists recon_owner_insert_own on public.reconciliation_matches;
create policy recon_owner_insert_own on public.reconciliation_matches
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists recon_owner_update_own on public.reconciliation_matches;
create policy recon_owner_update_own on public.reconciliation_matches
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists recon_owner_delete_own on public.reconciliation_matches;
create policy recon_owner_delete_own on public.reconciliation_matches
for delete to authenticated using (owner_id = auth.uid());

-- ============================================
-- G. audit_logs  (ASSUMED MINIMAL SCHEMA — see note above)
-- ============================================
-- Append-only by design: authenticated users (owner or tenant) may INSERT
-- their own audit rows and SELECT only rows scoped to their own owner_id,
-- but nobody can UPDATE or DELETE an audit log entry via the client — only
-- the service role (which bypasses RLS) could ever do that, e.g. for
-- retention/cleanup jobs.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_owner_select_own on public.audit_logs;
create policy audit_logs_owner_select_own on public.audit_logs
for select to authenticated using (owner_id = auth.uid());

drop policy if exists audit_logs_insert_scoped on public.audit_logs;
create policy audit_logs_insert_scoped on public.audit_logs
for insert to authenticated
with check (
  actor_id = auth.uid()
  and (
    owner_id = auth.uid() -- an owner logging their own action
    or exists (select 1 from public.tenants t where t.id::text = entity_id::text and t.profile_id = auth.uid() and t.owner_id = audit_logs.owner_id) -- a tenant logging an action scoped to their own owner
  )
);
-- No UPDATE or DELETE policy for authenticated/anon at all — audit rows
-- are immutable from the client's perspective once written.
