-- ============================================================
-- SUPER ADMIN SECURITY LAYER
-- Run this AFTER the existing phase5/phase6/phase7/rls_baseline SQL.
-- Existing Owner/Tenant policies are preserved; these are additive.
-- ============================================================

-- 1) Secure server-side role check.
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- 2) Super Admin can read all profiles, tenants, payments and the
-- forward-compatible management tables. Existing owner/tenant policies
-- remain unchanged and continue to scope their access.
drop policy if exists profiles_super_admin_select_all on public.profiles;
create policy profiles_super_admin_select_all on public.profiles
for select to authenticated
using (public.is_super_admin());

drop policy if exists profiles_super_admin_update_all on public.profiles;
create policy profiles_super_admin_update_all on public.profiles
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists tenants_super_admin_select_all on public.tenants;
create policy tenants_super_admin_select_all on public.tenants
for select to authenticated
using (public.is_super_admin());

drop policy if exists tenants_super_admin_update_all on public.tenants;
create policy tenants_super_admin_update_all on public.tenants
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists payments_super_admin_select_all on public.payments;
create policy payments_super_admin_select_all on public.payments
for select to authenticated
using (public.is_super_admin());

drop policy if exists payments_super_admin_update_all on public.payments;
create policy payments_super_admin_update_all on public.payments
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- These tables are created by rls_baseline.sql in this project. The DO
-- blocks make this migration safe if a deployment has not created one of
-- the optional tables yet.
do $$
begin
  if to_regclass('public.properties') is not null then
    execute 'drop policy if exists properties_super_admin_select_all on public.properties';
    execute 'create policy properties_super_admin_select_all on public.properties for select to authenticated using (public.is_super_admin())';
    execute 'drop policy if exists properties_super_admin_update_all on public.properties';
    execute 'create policy properties_super_admin_update_all on public.properties for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;
  if to_regclass('public.units') is not null then
    execute 'drop policy if exists units_super_admin_select_all on public.units';
    execute 'create policy units_super_admin_select_all on public.units for select to authenticated using (public.is_super_admin())';
    execute 'drop policy if exists units_super_admin_update_all on public.units';
    execute 'create policy units_super_admin_update_all on public.units for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;
  if to_regclass('public.bank_transactions') is not null then
    execute 'drop policy if exists bank_tx_super_admin_select_all on public.bank_transactions';
    execute 'create policy bank_tx_super_admin_select_all on public.bank_transactions for select to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.reconciliation_matches') is not null then
    execute 'drop policy if exists recon_super_admin_select_all on public.reconciliation_matches';
    execute 'create policy recon_super_admin_select_all on public.reconciliation_matches for select to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.audit_logs') is not null then
    execute 'drop policy if exists audit_logs_super_admin_select_all on public.audit_logs';
    execute 'create policy audit_logs_super_admin_select_all on public.audit_logs for select to authenticated using (public.is_super_admin())';
  end if;
end $$;

-- 3) Keep role self-escalation blocked for authenticated users, while
-- allowing trusted service-role Edge Functions (auth.uid() is NULL in their
-- database session) to provision Owner accounts.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'role cannot be changed by the user';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
before update on public.profiles
for each row execute function public.prevent_role_self_escalation();


-- ============================================================
-- FIRST SUPER ADMIN ACCOUNT
-- ============================================================
-- Do NOT insert a password here. Supabase Auth owns passwords.
--
-- 1. In Supabase Dashboard -> Authentication -> Users, create a user with
--    the desired Super Admin email/password (email may be confirmed).
-- 2. Copy that user's UUID.
-- 3. Run:
--
-- update public.profiles
-- set role = 'super_admin'
-- where id = 'PASTE-AUTH-USER-UUID-HERE';
--
-- After this, sign in through the existing Owner login tab using that
-- Super Admin email/password. The application will route the account to
-- the new isolated Super Admin panel.
