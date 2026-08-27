-- ============================================
-- A. LOGIN EMAIL COLUMN
-- ============================================
alter table public.tenants add column if not exists login_email text;
create unique index if not exists idx_tenants_login_email on public.tenants(login_email);

-- ============================================
-- A. USERNAME MUST BE GLOBALLY UNIQUE — CASE-INSENSITIVE
-- ============================================
-- SECURITY: get_tenant_login_email() (below) resolves a login username via
-- lower(username) = lower(trim(p_username)) — i.e. login is
-- case-insensitive. A plain `unique (username)` constraint is
-- case-SENSITIVE, which would let two different rows exist as e.g. "Shop1"
-- and "shop1" — an ambiguous pair that get_tenant_login_email() cannot tell
-- apart (it would silently return whichever row Postgres happens to match
-- first, or error, depending on how many rows satisfy the lower() compare).
-- Enforce the same case-insensitive rule at the DB level so uniqueness can
-- never drift out of sync with login behavior. (The create-tenant Edge
-- Function already normalizes new usernames to lowercase at insert time —
-- this index is the authoritative, defense-in-depth guarantee that no
-- future insert path, migration, or manual edit can ever create an
-- ambiguous pair.)
alter table public.tenants drop constraint if exists tenants_owner_id_username_key;
alter table public.tenants drop constraint if exists tenants_username_key;
create unique index if not exists idx_tenants_username_lower on public.tenants (lower(username));

-- ============================================
-- B. AUTO-CREATE profiles ROW ON NEW auth.users ROW
-- ============================================
-- SECURITY: this trigger fires on EVERY insert into auth.users, whether it
-- came from the public, anon-callable supabase.auth.signUp() endpoint or
-- from a trusted service-role admin.createUser() call (e.g. create-tenant
-- Edge Function). new.raw_user_meta_data is entirely client-controlled at
-- signup time — a client can call supabase.auth.signUp() directly (bypassing
-- any app UI) with options.data.role = 'owner' and mint themselves an Owner
-- account. This trigger MUST NOT ever derive role from client metadata.
-- Every new auth user is unconditionally created as 'tenant'. Granting the
-- 'owner' role is a privileged, out-of-band operation only — e.g. a
-- service-role script or a manual `update public.profiles set role='owner'
-- where id = ...` run by the platform operator via the Supabase dashboard —
-- and must never be reachable from any client-side call.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    'tenant',
    new.raw_user_meta_data->>'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================
-- C. USERNAME -> LOGIN EMAIL LOOKUP (anon-callable, returns only an email string)
-- ============================================
create or replace function public.get_tenant_login_email(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select login_email
  from public.tenants
  where lower(username) = lower(trim(p_username))
    and is_active = true
  limit 1;
$$;

-- ============================================
-- D. TENANT SELF-UPDATE RPC (contact fields ONLY)
-- ============================================
create or replace function public.update_own_tenant_contact_info(
  p_contact_number text default null,
  p_email          text default null,
  p_notes          text default null
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_result public.tenants;
begin
  select id into v_tenant_id
  from public.tenants
  where profile_id = auth.uid()
  limit 1;

  if v_tenant_id is null then
    raise exception 'No tenant record linked to this account.';
  end if;

  update public.tenants
  set contact_number = coalesce(p_contact_number, contact_number),
      email          = coalesce(p_email, email),
      notes          = coalesce(p_notes, notes)
  where id = v_tenant_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ============================================
-- E. PREVENT ROLE SELF-ESCALATION
-- (closes a real gap: the existing "update own profile" policy alone
--  would otherwise let a user set role='owner' on their own row)
-- ============================================
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed by the user';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ============================================
-- F. GRANTS / REVOKES
-- ============================================
revoke all on function public.get_tenant_login_email from public;
grant execute on function public.get_tenant_login_email to anon, authenticated;

revoke all on function public.update_own_tenant_contact_info from public;
grant execute on function public.update_own_tenant_contact_info to authenticated;

-- handle_new_auth_user and prevent_role_self_escalation are trigger-only
-- functions (never called directly by client code) — no client grants needed.

-- No changes needed to existing RLS policies on tenants/payments/properties/
-- units/bank_transactions/reconciliation_matches/audit_logs from Phase 1/7 —
-- verified consistent, listed here for the record only (not re-run):
--   tenants:  owner full access (owner_id=auth.uid()) + tenant self-read (profile_id=auth.uid())
--   payments: owner full access + tenant select/insert/update own, no tenant delete