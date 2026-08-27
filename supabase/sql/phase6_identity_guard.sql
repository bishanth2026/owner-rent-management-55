-- Extended in a later pass (see task item #6) to also lock down the
-- ownership/valuation fields specifically against TENANT self-updates,
-- while still allowing the OWNER (or service role) to change them via
-- ownerTenants()'s Edit/Deactivate/Reactivate flows. This is
-- defense-in-depth: rls_baseline.sql deliberately gives tenants no general
-- UPDATE policy on this table at all (self-service only goes through the
-- update_own_tenant_contact_info() SECURITY DEFINER RPC), so this branch
-- should never actually be reachable by a tenant today — but if a future
-- change ever reintroduces a broader tenant UPDATE policy, this trigger is
-- the backstop that still prevents a tenant from touching these fields.
create or replace function public.prevent_tenant_identity_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    -- Identity/ownership fields: locked for EVERY authenticated caller,
    -- including the owner. These are set once at creation (create-tenant
    -- Edge Function) or migration and never change afterward.
    if new.username is distinct from old.username then
      raise exception 'username cannot be changed here';
    end if;
    if new.login_email is distinct from old.login_email then
      raise exception 'login_email cannot be changed here';
    end if;
    if new.profile_id is distinct from old.profile_id then
      raise exception 'profile_id cannot be changed here';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'owner_id cannot be changed here';
    end if;

    -- Valuation/assignment/status fields: locked specifically for the
    -- TENANT themselves (auth.uid() = old.profile_id). The owner
    -- (auth.uid() = old.owner_id) is still permitted to change these —
    -- that's exactly what updateTenantEditableFields()/deactivateTenant()/
    -- reactivateTenant() legitimately do.
    if auth.uid() = old.profile_id then
      if new.monthly_rent is distinct from old.monthly_rent then
        raise exception 'monthly_rent cannot be changed by the tenant';
      end if;
      if new.rent_start_date is distinct from old.rent_start_date then
        raise exception 'rent_start_date cannot be changed by the tenant';
      end if;
      if new.is_active is distinct from old.is_active then
        raise exception 'is_active cannot be changed by the tenant';
      end if;
      if new.property_id is distinct from old.property_id then
        raise exception 'property_id cannot be changed by the tenant';
      end if;
      if new.unit_id is distinct from old.unit_id then
        raise exception 'unit_id cannot be changed by the tenant';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_tenant_identity_field_changes on public.tenants;
create trigger trg_prevent_tenant_identity_field_changes
  before update on public.tenants
  for each row execute function public.prevent_tenant_identity_field_changes();