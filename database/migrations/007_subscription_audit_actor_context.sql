BEGIN;

CREATE OR REPLACE FUNCTION audit_subscription_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  audit_actor_user_id UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.plan_key IS NOT DISTINCT FROM NEW.plan_key
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.current_period_start IS NOT DISTINCT FROM NEW.current_period_start
     AND OLD.current_period_end IS NOT DISTINCT FROM NEW.current_period_end THEN
    RETURN NEW;
  END IF;

  audit_actor_user_id :=
    NULLIF(current_setting('app.actor_user_id', TRUE), '')::UUID;

  INSERT INTO subscription_state_events (
    subscription_id,
    subject_user_id,
    previous_subject_user_id,
    actor_user_id,
    previous_plan_key,
    new_plan_key,
    previous_status,
    new_status
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.user_id ELSE NULL END,
    audit_actor_user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_key ELSE NULL END,
    NEW.plan_key,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status
  );
  RETURN NEW;
END;
$$;

COMMIT;
