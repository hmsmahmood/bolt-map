CREATE TABLE IF NOT EXISTS vehicle_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('car', 'motorcycle', 'truck')),
  make TEXT NOT NULL CHECK (char_length(btrim(make)) BETWEEN 1 AND 60),
  model TEXT NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 60),
  model_year SMALLINT NULL CHECK (model_year IS NULL OR model_year BETWEEN 1900 AND 2100),
  registration_number TEXT NULL CHECK (registration_number IS NULL OR char_length(registration_number) <= 20),
  max_weight_kg INTEGER NULL CHECK (max_weight_kg IS NULL OR max_weight_kg BETWEEN 1 AND 100000),
  max_height_cm INTEGER NULL CHECK (max_height_cm IS NULL OR max_height_cm BETWEEN 1 AND 1000),
  max_length_cm INTEGER NULL CHECK (max_length_cm IS NULL OR max_length_cm BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_profiles_user_created
  ON vehicle_profiles (user_id, created_at);
