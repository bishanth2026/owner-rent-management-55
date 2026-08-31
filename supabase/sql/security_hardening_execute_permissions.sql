-- Security hardening only: browser clients do not need direct EXECUTE access
-- to PostgreSQL trigger functions. PostgreSQL invokes these through triggers.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_payment_tenant_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_self_escalation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_tenant_identity_field_changes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_payment_owner_id() FROM authenticated;

-- Tenant username -> login email lookup is needed before authentication.
-- Keep anon access for the existing tenant login flow, but remove the
-- unnecessary authenticated access after login.
REVOKE EXECUTE ON FUNCTION public.get_tenant_login_email(text) FROM authenticated;
