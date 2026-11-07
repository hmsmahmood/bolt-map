BEGIN;

CREATE TABLE IF NOT EXISTS community_incident_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('report.create', 'report.vote', 'report.delete')
  ),
  incident_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN (
      'created',
      'merged',
      'recorded',
      'already_voted',
      'deleted',
      'not_owned_or_missing'
    )
  ),
  vote TEXT CHECK (vote IN ('confirm', 'clear')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type = 'report.vote') = (vote IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_community_incident_audit_actor_created
  ON community_incident_audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_incident_audit_incident_created
  ON community_incident_audit_events (incident_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_community_incident_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Community incident audit events are append-only.';
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER community_incident_audit_no_update_delete
    BEFORE UPDATE OR DELETE ON community_incident_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_community_incident_audit_mutation();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER community_incident_audit_no_truncate
    BEFORE TRUNCATE ON community_incident_audit_events
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_community_incident_audit_mutation();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

REVOKE UPDATE, DELETE, TRUNCATE
  ON TABLE community_incident_audit_events FROM PUBLIC;

COMMIT;
