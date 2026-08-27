-- ============================================
-- PHASE 7 — CLOUD PAYMENTS (table, guard trigger, RLS)
-- ============================================
-- Companion to lib/payments.js. This is the schema + policy set that makes
-- public.payments the single source of truth for all payment records,
-- replacing the pre-Phase-9 localStorage-only architecture.
--
-- Run this AFTER phase5.sql and phase6_identity_guard.sql (it references
-- public.tenants and public.profiles, both created/altered there).

-- ============================================
-- A. TABLE
-- ============================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  -- Denormalized for fast owner-scoped queries/RLS and kept in sync by the
  -- set_payment_owner_id trigger below — never trust a client-supplied
  -- owner_id, always derive it server-side from tenant_id.
  owner_id uuid not null references public.profiles(id) on delete restrict,
  date date not null,
  amount numeric(12,2) not null check (amount > 0),
  bank text,
  ref text,
  note text,
  status text not null default 'Recorded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_tenant_id on public.payments(tenant_id);
create index if not exists idx_payments_owner_id on public.payments(owner_id);
create index if not exists idx_payments_date on public.payments(date);

alter table public.payments enable row level security;

-- ============================================
-- B. owner_id AUTO-DERIVATION + updated_at MAINTENANCE
-- ============================================
-- Always derives owner_id from the referenced tenant row server-side —
-- never trusts a client-supplied owner_id, and re-derives it on any
-- (permitted) tenant_id change so the denormalized column can never drift
-- out of sync with the true owner.
create or replace function public.set_payment_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.tenants where id = new.tenant_id;
  if v_owner_id is null then
    raise exception 'Invalid tenant_id: no such tenant';
  end if;
  new.owner_id := v_owner_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_payment_owner_id on public.payments;
create trigger trg_set_payment_owner_id
before insert or update on public.payments
for each row execute function public.set_payment_owner_id();

-- ============================================
-- C. IDENTITY GUARD — tenant_id IS IMMUTABLE, status IS TENANT-READ-ONLY
-- ============================================
-- Mirrors phase6_identity_guard.sql's prevent_tenant_identity_field_changes
-- pattern: a payment must never be able to be reassigned from one tenant to
-- another by a client, and a tenant must never be able to alter a
-- payment's `status` directly (task item #4/#5 — client-side field
-- whitelists in lib/payments.js are only the first layer; this trigger is
-- the authoritative, database-level backstop that closes the gap even if a
-- future change ever calls supabase.from('payments').update(...) directly
-- instead of going through updateOwnPayment()/ownerUpdatePayment()).
create or replace function public.prevent_payment_tenant_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_tenant_caller boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id cannot be changed on an existing payment record';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id cannot be changed on an existing payment record';
  end if;
  if new.owner_id is distinct from old.owner_id then
    -- Defense-in-depth only: set_payment_owner_id (a BEFORE trigger that
    -- runs earlier in the same statement) already overwrites owner_id from
    -- tenant_id server-side on every insert/update, so a client-supplied
    -- owner_id value is never actually used — this check just makes the
    -- intent explicit and fails loudly if that invariant is ever broken.
    raise exception 'owner_id cannot be changed directly';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be changed';
  end if;
  -- updated_at is not checked here — set_payment_owner_id (BEFORE trigger,
  -- runs earlier in the same statement) unconditionally overwrites it to
  -- now() on every insert/update, so no client-supplied value ever survives
  -- regardless of what's sent.

  -- Is the caller the tenant who owns this payment (as opposed to the
  -- owner of that tenant, who IS allowed to set status — e.g. marking a
  -- payment "Verified" after bank reconciliation review)?
  select exists (
    select 1 from public.tenants t
    where t.id = old.tenant_id and t.profile_id = auth.uid()
  ) into v_is_tenant_caller;

  if v_is_tenant_caller and (new.status is distinct from old.status) then
    raise exception 'status cannot be changed by the tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_payment_tenant_change on public.payments;
create trigger trg_prevent_payment_tenant_change
before update on public.payments
for each row execute function public.prevent_payment_tenant_change();

-- ============================================
-- D. RLS POLICIES
-- ============================================
-- SELECT — a tenant sees only their own payments; an owner sees only
-- payments belonging to tenants they own. (Two permissive policies for the
-- same command are combined with OR, so either condition being true grants
-- access — this is standard Postgres RLS behavior, not a gap.)
drop policy if exists payments_tenant_select_own on public.payments;
create policy payments_tenant_select_own on public.payments
for select to authenticated
using (
  exists (
    select 1 from public.tenants t
    where t.id = payments.tenant_id and t.profile_id = auth.uid()
  )
);

drop policy if exists payments_owner_select_own on public.payments;
create policy payments_owner_select_own on public.payments
for select to authenticated
using (payments.owner_id = auth.uid());

-- INSERT — a tenant may insert only for their own tenant_id; an owner may
-- insert only for a tenant they own (used by the Bank Reconciliation
-- "Add to Ledger" flow). Both checks run against tenant_id since owner_id
-- on the incoming row is untrusted client input until the
-- set_payment_owner_id trigger (BEFORE INSERT) overwrites it — WITH CHECK
-- runs after BEFORE triggers, so it correctly validates the
-- trigger-derived owner_id, but we still anchor the check on tenant_id
-- ownership directly for clarity and defense-in-depth.
drop policy if exists payments_tenant_insert_own on public.payments;
create policy payments_tenant_insert_own on public.payments
for insert to authenticated
with check (
  exists (
    select 1 from public.tenants t
    where t.id = payments.tenant_id and t.profile_id = auth.uid() and t.is_active = true
  )
);

drop policy if exists payments_owner_insert_own_tenant on public.payments;
create policy payments_owner_insert_own_tenant on public.payments
for insert to authenticated
with check (
  exists (
    select 1 from public.tenants t
    where t.id = payments.tenant_id and t.owner_id = auth.uid()
  )
);

-- UPDATE — same ownership rules as SELECT, re-validated on the new row via
-- WITH CHECK (which, combined with the prevent_payment_tenant_change
-- trigger, makes reassigning a payment to a different tenant impossible
-- for both tenants and owners).
drop policy if exists payments_tenant_update_own on public.payments;
create policy payments_tenant_update_own on public.payments
for update to authenticated
using (
  exists (
    select 1 from public.tenants t
    where t.id = payments.tenant_id and t.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tenants t
    where t.id = payments.tenant_id and t.profile_id = auth.uid()
  )
);

drop policy if exists payments_owner_update_own on public.payments;
create policy payments_owner_update_own on public.payments
for update to authenticated
using (payments.owner_id = auth.uid())
with check (payments.owner_id = auth.uid());

-- DELETE — owner-only, matching the app's UI design (only the owner
-- Payments page has ever shown a Delete button; tenants can only edit,
-- never delete, their own payment history).
drop policy if exists payments_owner_delete_own on public.payments;
create policy payments_owner_delete_own on public.payments
for delete to authenticated
using (payments.owner_id = auth.uid());

-- No policy grants access to the 'anon' role at all — payments require an
-- authenticated session (owner or tenant) for every operation.
