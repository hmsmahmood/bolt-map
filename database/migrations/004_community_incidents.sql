BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS community_incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (
    report_type IN ('congestion', 'accident', 'road_hazard', 'road_closure', 'breakdown')
  ),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_community_incident_location
  ON community_incident_reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_community_incident_active_expiry
  ON community_incident_reports (expires_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_community_incident_reporter_created
  ON community_incident_reports (reporter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_incident_votes (
  report_id UUID NOT NULL REFERENCES community_incident_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'clear')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_incident_votes_user
  ON community_incident_votes (user_id);

COMMIT;
