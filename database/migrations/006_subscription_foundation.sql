BEGIN;

CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_key TEXT PRIMARY KEY CHECK (
    plan_key ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  display_name JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(display_name) = 'object'
  ),
  description JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(description) = 'object'
  ),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_entitlement_definitions (
  entitlement_key TEXT PRIMARY KEY CHECK (
    entitlement_key ~ '^[a-z][a-z0-9_.-]{0,127}$'
  ),
  value_type TEXT NOT NULL CHECK (
    value_type IN ('boolean', 'integer', 'number', 'string', 'object')
  ),
  description JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(description) = 'object'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plan_entitlements (
  plan_key TEXT NOT NULL REFERENCES subscription_plans(plan_key) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL REFERENCES subscription_entitlement_definitions(entitlement_key) ON DELETE RESTRICT,
  is_enabled BOOLEAN NOT NULL,
  quota_limit BIGINT CHECK (quota_limit IS NULL OR quota_limit >= 0),
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  PRIMARY KEY (plan_key, entitlement_key)
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL REFERENCES subscription_plans(plan_key) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'active', 'grace_period', 'canceled', 'expired', 'revoked')
  ),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    current_period_start IS NULL
    OR current_period_end IS NULL
    OR current_period_end >= current_period_start
  )
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_updated
  ON user_subscriptions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status_period
  ON user_subscriptions (status, current_period_end);

CREATE TABLE IF NOT EXISTS subscription_transaction_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (
    provider = LOWER(BTRIM(provider)) AND LENGTH(provider) BETWEEN 1 AND 64
  ),
  transaction_reference TEXT NOT NULL CHECK (
    transaction_reference = BTRIM(transaction_reference)
    AND LENGTH(transaction_reference) BETWEEN 1 AND 512
  ),
  original_transaction_reference TEXT CHECK (
    original_transaction_reference IS NULL
    OR (
      original_transaction_reference = BTRIM(original_transaction_reference)
      AND LENGTH(original_transaction_reference) BETWEEN 1 AND 512
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, transaction_reference)
);

CREATE INDEX IF NOT EXISTS idx_subscription_transactions_subscription
  ON subscription_transaction_references (subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_state_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL,
  subject_user_id UUID NOT NULL,
  previous_subject_user_id UUID,
  actor_user_id UUID,
  previous_plan_key TEXT,
  new_plan_key TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL CHECK (
    new_status IN ('pending', 'active', 'grace_period', 'canceled', 'expired', 'revoked')
  ),
  change_source TEXT NOT NULL DEFAULT 'database',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);

ALTER TABLE subscription_state_events
  ADD COLUMN IF NOT EXISTS previous_subject_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_subscription_state_events_subject_created
  ON subscription_state_events (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_state_events_subscription_created
  ON subscription_state_events (subscription_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_subscription_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.plan_key IS NOT DISTINCT FROM NEW.plan_key
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.current_period_start IS NOT DISTINCT FROM NEW.current_period_start
     AND OLD.current_period_end IS NOT DISTINCT FROM NEW.current_period_end THEN
    RETURN NEW;
  END IF;

  INSERT INTO subscription_state_events (
    subscription_id,
    subject_user_id,
    previous_subject_user_id,
    previous_plan_key,
    new_plan_key,
    previous_status,
    new_status
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.user_id ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_key ELSE NULL END,
    NEW.plan_key,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER user_subscriptions_audit_state
    AFTER INSERT OR UPDATE OF user_id, plan_key, status, current_period_start, current_period_end
    ON user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION audit_subscription_state_change();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_subscription_state_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Subscription state events are append-only.';
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER subscription_state_events_no_update_delete
    BEFORE UPDATE OR DELETE ON subscription_state_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_subscription_state_event_mutation();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER subscription_state_events_no_truncate
    BEFORE TRUNCATE ON subscription_state_events
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_subscription_state_event_mutation();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

REVOKE UPDATE, DELETE, TRUNCATE
  ON TABLE subscription_state_events FROM PUBLIC;

COMMIT;
