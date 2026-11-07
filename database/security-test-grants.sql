BEGIN;

-- SAFETY CHECKS: abort if this is not the isolated test database.
DO $$
DECLARE
    table_name TEXT;
    required_tables TEXT[] := ARRAY[
        'users',
        'user_profiles',
        'email_verification_tokens',
        'otp_verifications',
        'mfa_settings',
        'password_reset_tokens',
        'refresh_tokens',
        'auth_security_events',
        'auth_rate_limits',
        'vehicle_profiles',
        'community_incident_reports',
        'community_incident_votes',
        'community_incident_audit_events',
        'routes',
        'incidents',
        'fleet_vehicles',
        'flood_alerts',
        'subscription_plans',
        'subscription_plan_entitlements',
        'subscription_entitlement_definitions',
        'user_subscriptions',
        'subscription_state_events',
        'subscription_transaction_references'
    ];
BEGIN
    IF current_database() <> 'smartroute_security_test' THEN
        RAISE EXCEPTION
            'SAFETY STOP: Wrong database: %',
            current_database();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'smartroute_app'
    ) THEN
        RAISE EXCEPTION 'SAFETY STOP: smartroute_app role missing';
    END IF;

    FOREACH table_name IN ARRAY required_tables LOOP
        IF to_regclass('public.' || quote_ident(table_name)) IS NULL THEN
            RAISE EXCEPTION
                'SAFETY STOP: Missing table public.%', table_name;
        END IF;
    END LOOP;
END $$;

-- AUTHENTICATION
GRANT SELECT, INSERT, UPDATE
ON public.users TO smartroute_app;

GRANT INSERT
ON public.user_profiles TO smartroute_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.email_verification_tokens,
   public.otp_verifications,
   public.password_reset_tokens,
   public.refresh_tokens,
   public.auth_rate_limits
TO smartroute_app;

GRANT SELECT, INSERT, UPDATE
ON public.mfa_settings
TO smartroute_app;

-- SECURITY EVENTS: INSERT plus only the columns needed for RETURNING.
GRANT INSERT
ON public.auth_security_events TO smartroute_app;

GRANT SELECT (id, created_at)
ON public.auth_security_events TO smartroute_app;

-- VEHICLES
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.vehicle_profiles TO smartroute_app;

-- COMMUNITY REPORTING
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.community_incident_reports TO smartroute_app;

GRANT SELECT, INSERT
ON public.community_incident_votes TO smartroute_app;

GRANT INSERT
ON public.community_incident_audit_events TO smartroute_app;

-- OPERATIONAL DATA: READ ONLY
GRANT SELECT
ON public.routes,
   public.incidents,
   public.fleet_vehicles,
   public.flood_alerts
TO smartroute_app;

-- SUBSCRIPTIONS: READ ONLY
GRANT SELECT
ON public.subscription_plans,
   public.subscription_plan_entitlements,
   public.subscription_entitlement_definitions,
   public.user_subscriptions
TO smartroute_app;

-- Intentionally no grants on:
-- subscription_state_events
-- subscription_transaction_references

COMMIT;