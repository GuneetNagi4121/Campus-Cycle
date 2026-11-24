-- ===========================================================================
-- CampusCycle — migration 003: illustrated campus map, fleet lifecycle and
-- data-integrity hardening.
--
-- ADDITIVE AND IDEMPOTENT. Nothing is dropped or truncated; existing users,
-- stations, bicycles, rentals and reports are preserved. Safe to re-run.
--
--   1. stations.code / map_x / map_y — a station's position on the supplied
--      illustrated campus map, stored as a percentage (0–100) of the image
--      width and height. The map is an illustration, not a georeferenced
--      image, so these are deliberately NOT latitude/longitude. Percentages
--      keep markers correctly placed at any rendered size or zoom level.
--   2. bicycles.model and a RETIRED status for decommissioned cycles.
--   3. Two more maintenance categories: FRAME (damaged bicycle) and QR_CODE.
--   4. Integrity rules enforced by PostgreSQL itself:
--        * an IN_USE bicycle is never parked at a station,
--        * an AVAILABLE/RESERVED bicycle is always parked at a station,
--        * a station can never hold more bicycles than its capacity, even
--          under concurrent returns (trigger takes a row lock on the station).
--   5. Indexes that back the per-station analytics.
--
-- Run with:  npm run db:migrate:phase2   (applies every file in migrations/)
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Station map position (percentage of the image) and a short stop code.
-- ---------------------------------------------------------------------------
ALTER TABLE stations ADD COLUMN IF NOT EXISTS code  VARCHAR(12);
ALTER TABLE stations ADD COLUMN IF NOT EXISTS map_x NUMERIC(6,3);
ALTER TABLE stations ADD COLUMN IF NOT EXISTS map_y NUMERIC(6,3);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stations_code ON stations(code) WHERE code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stations_map_x') THEN
    ALTER TABLE stations ADD CONSTRAINT chk_stations_map_x
      CHECK (map_x IS NULL OR (map_x >= 0 AND map_x <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stations_map_y') THEN
    ALTER TABLE stations ADD CONSTRAINT chk_stations_map_y
      CHECK (map_y IS NULL OR (map_y >= 0 AND map_y <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stations_map_paired') THEN
    ALTER TABLE stations ADD CONSTRAINT chk_stations_map_paired
      CHECK ((map_x IS NULL) = (map_y IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stations_code_format') THEN
    ALTER TABLE stations ADD CONSTRAINT chk_stations_code_format
      CHECK (code IS NULL OR code ~ '^[A-Z0-9-]{2,12}$');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Bicycle model + RETIRED status.
-- ---------------------------------------------------------------------------
ALTER TABLE bicycles ADD COLUMN IF NOT EXISTS model VARCHAR(80);

ALTER TABLE bicycles DROP CONSTRAINT IF EXISTS bicycles_status_check;
ALTER TABLE bicycles ADD CONSTRAINT bicycles_status_check
  CHECK (status IN ('AVAILABLE', 'RESERVED', 'IN_USE', 'MAINTENANCE', 'RETIRED'));

-- ---------------------------------------------------------------------------
-- 3. Maintenance categories: damaged bicycle (frame) and QR code problems.
-- ---------------------------------------------------------------------------
ALTER TABLE maintenance_reports DROP CONSTRAINT IF EXISTS maintenance_reports_category_check;
ALTER TABLE maintenance_reports ADD CONSTRAINT maintenance_reports_category_check
  CHECK (category IN ('BRAKES', 'TYRE', 'CHAIN', 'LIGHT', 'SEAT', 'FRAME', 'QR_CODE', 'OTHER'));

-- ---------------------------------------------------------------------------
-- 4a. Bicycle/station consistency. NOT VALID: enforced for every new or
--     changed row without re-checking (and possibly rejecting) old rows.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bicycle_in_use_unparked') THEN
    ALTER TABLE bicycles ADD CONSTRAINT chk_bicycle_in_use_unparked
      CHECK (status <> 'IN_USE' OR station_id IS NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bicycle_parked_has_station') THEN
    ALTER TABLE bicycles ADD CONSTRAINT chk_bicycle_parked_has_station
      CHECK (status NOT IN ('AVAILABLE', 'RESERVED') OR station_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4b. Station capacity, enforced by the database.
--     Locking the station row serialises concurrent arrivals at one station,
--     so two simultaneous returns can never both take the last free dock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_station_capacity() RETURNS trigger AS $$
DECLARE
  cap    INTEGER;
  parked INTEGER;
BEGIN
  IF NEW.station_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.station_id IS NOT DISTINCT FROM OLD.station_id THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO cap FROM stations WHERE id = NEW.station_id FOR UPDATE;
  IF cap IS NULL THEN
    RETURN NEW; -- unknown station: the foreign key reports it
  END IF;

  SELECT COUNT(*) INTO parked
  FROM bicycles
  WHERE station_id = NEW.station_id AND id <> NEW.id;

  IF parked >= cap THEN
    RAISE EXCEPTION 'Station % is full (% of % docks in use)', NEW.station_id, parked, cap
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_station_capacity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bicycles_station_capacity ON bicycles;
CREATE TRIGGER trg_bicycles_station_capacity
  BEFORE INSERT OR UPDATE OF station_id ON bicycles
  FOR EACH ROW EXECUTE FUNCTION enforce_station_capacity();

-- ---------------------------------------------------------------------------
-- 5. Indexes for per-station analytics and history filters.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rentals_start_station ON rentals(start_station_id);
CREATE INDEX IF NOT EXISTS idx_rentals_end_station   ON rentals(end_station_id);
CREATE INDEX IF NOT EXISTS idx_rentals_ended         ON rentals(ended_at DESC) WHERE ended_at IS NOT NULL;

COMMIT;
