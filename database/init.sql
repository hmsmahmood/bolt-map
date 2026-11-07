CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  replacement_token_hash TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code TEXT NOT NULL UNIQUE,
  driver_name TEXT NOT NULL,
  status TEXT NOT NULL,
  battery_level INTEGER NOT NULL DEFAULT 100,
  speed_kmh INTEGER NOT NULL DEFAULT 0,
  last_position GEOGRAPHY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  eta_minutes INTEGER NOT NULL,
  progress_percent INTEGER NOT NULL,
  origin GEOGRAPHY(Point, 4326),
  destination GEOGRAPHY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL,
  eta_minutes INTEGER NOT NULL,
  geom GEOGRAPHY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flood_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,
  severity TEXT NOT NULL,
  rainfall_mm_hr NUMERIC(5,2) NOT NULL,
  action_plan TEXT NOT NULL,
  geom GEOGRAPHY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_status ON routes (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_flood_alerts_severity ON flood_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_status ON fleet_vehicles (status);

INSERT INTO users (email, password_hash, full_name, role)
VALUES ('ops@smartroute.ai', '$argon2id$v=19$m=65536,p=4,t=3$VQAD1a+bgRQWJUgBznGwAg$Itl6/6CwxgQCE+QjW8ppPMziiYuUK/Q+2BIp6o7+ROs', 'Aisha Rahman', 'Fleet operations manager')
ON CONFLICT (email) DO NOTHING;

INSERT INTO fleet_vehicles (vehicle_code, driver_name, status, battery_level, speed_kmh)
VALUES
  ('V-301', 'Nadia', 'Online', 86, 62),
  ('V-402', 'Kamal', 'Idle', 72, 0),
  ('V-540', 'Lee', 'On route', 92, 54)
ON CONFLICT (vehicle_code) DO NOTHING;

INSERT INTO routes (external_id, title, driver_name, status, priority, eta_minutes, progress_percent)
VALUES
  ('RT-1042', 'KLIA to Petaling Jaya', 'Aiman Razak', 'On-route', 'High', 14, 74),
  ('RT-1187', 'Sungai Besi to Cyberjaya', 'Siti Nabila', 'Delayed', 'Medium', 22, 58),
  ('RT-1204', 'Cheras to Klang Valley Hub', 'Hafiz Ismail', 'Stopped', 'Critical', 6, 89)
ON CONFLICT (external_id) DO NOTHING;

INSERT INTO incidents (external_id, incident_type, severity, location, status, eta_minutes)
VALUES
  ('INC-223', 'Flood risk', 'High', 'Jalan Tun Razak', 'Monitoring', 12),
  ('INC-228', 'Roadworks', 'Medium', 'MRT Jalan Ampang', 'Diversion active', 8),
  ('INC-230', 'Traffic incident', 'Low', 'Lebuhraya Damansara Puchong', 'Cleared', 3)
ON CONFLICT (external_id) DO NOTHING;

INSERT INTO flood_alerts (external_id, area, severity, rainfall_mm_hr, action_plan)
VALUES
  ('FLOOD-01', 'Jalan Perak', 'High risk', 84.00, 'Deploy culvert inspection team'),
  ('FLOOD-02', 'Shah Alam', 'Moderate', 62.00, 'Monitor drainage pumps')
ON CONFLICT (external_id) DO NOTHING;
