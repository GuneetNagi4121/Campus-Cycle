-- ===========================================================================
-- CampusCycle — campus map seed (stations, fleet, demo accounts)
--
-- NON-DESTRUCTIVE AND IDEMPOTENT. Never truncates or deletes anything, never
-- resets a password, and never overwrites a value an administrator has
-- already edited. Safe to run repeatedly against a database with real data.
--
--   1. Folds the six Phase 1 development stations (Library, Hostel A, ...)
--      into the matching campus stops so their bicycles and ride history are
--      kept — only when that stop code is not in use yet.
--   2. Creates the 19 proposed bicycle stops placed on the illustrated campus
--      map. Positions are PIXELS of campus-map.png (1280 x 720) converted to
--      percentages; they are image positions, not GPS coordinates. A stop that
--      already exists keeps its name, capacity and position; only a missing
--      position is filled in.
--   3. Adds a demonstration fleet (CC-xx-n) — each code is created at most
--      once, ever, and never beyond a station's capacity.
--   4. Ensures a demo administrator and a demo student exist (inserted only
--      if the email is not registered; existing passwords are untouched).
--   5. Adds a small, clearly-dated set of completed sample rides — only on a
--      database where no CC fleet bicycle has ever been ridden.
--
-- These are PROPOSED stop locations for the project, not a claim that bicycle
-- infrastructure already exists at these places on campus.
--
-- Run with:  npm run db:seed:campus   (from backend/)
-- Demo credentials: see DEMO_CREDENTIALS.local.md (not committed).
-- ===========================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Stop definitions (one place to edit). px/py = pixel on campus-map.png.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE campus_stops (
  code      VARCHAR(12) PRIMARY KEY,
  name      VARCHAR(120) NOT NULL,
  location  VARCHAR(255) NOT NULL,
  capacity  INTEGER      NOT NULL,
  px        INTEGER      NOT NULL,
  py        INTEGER      NOT NULL,
  fleet     INTEGER      NOT NULL,  -- demo bicycles to place here
  legacy    VARCHAR(120)            -- Phase 1 dev station folded into this stop
) ON COMMIT DROP;

INSERT INTO campus_stops (code, name, location, capacity, px, py, fleet, legacy) VALUES
  ('ST01', 'Main Entrance Stop',    'Main Entrance, south-east gate',                       15, 1160, 648, 8, NULL),
  ('ST02', 'Canteen Stop',          'Beside the Canteen, ATM and shops',                    12,  871, 535, 6, 'Cafeteria'),
  ('ST03', 'Central Park Stop',     'Central Park, by Kravings food court',                 10,  590, 413, 5, NULL),
  ('ST04', 'Library Stop',          'In front of the Library and LP 101-103',               12,  890, 413, 6, 'Library'),
  ('ST05', 'CS Block Stop',         'Ring road above the CS Block, near the Health Centre', 10,  842, 234, 5, NULL),
  ('ST06', 'Academic Block Stop',   'Academic blocks B-F, opposite Mechanical Workshop',    12, 1010, 413, 6, 'Academic Block'),
  ('ST07', 'Sports Complex Stop',   'North side of the Sports Complex',                     10,  560, 255, 5, 'Sports Complex'),
  ('ST08', 'Student Track Stop',    'West road beside the Synthetic Track',                  8,  163, 315, 4, NULL),
  ('ST09', 'Cricket Ground Stop',   'Loop road west of the Cricket Field',                   8,  350, 215, 4, NULL),
  ('ST10', 'Tennis Court Stop',     'Central avenue beside the Tennis Court and Fete Area',  8,  508, 300, 4, NULL),
  ('ST11', 'Agira Hall Stop',       'Hostel A - Agira Hall',                                12,  508, 595, 6, 'Hostel A'),
  ('ST12', 'Amritam Hall Stop',     'Hostel B - Amritam Hall',                              12,  370, 648, 6, 'Hostel B'),
  ('ST13', 'Neeram Hall Stop',      'Hostel D - Neeram Hall',                               10,  100, 648, 5, NULL),
  ('ST14', 'Viyat Hall Stop',       'Hostel L - Viyat Hall',                                10,  655, 128, 5, NULL),
  ('ST15', 'Vasudha Hall Stop',     'Hostels E and G - Vasudha Hall',                       10,  698, 330, 5, NULL),
  ('ST16', 'Anantam Hall Stop',     'Hostel M - Anantam Hall',                              12,  190, 413, 6, NULL),
  ('ST17', 'Ambaram Hall Stop',     'Hostel K - Ambaram Hall',                              10,  450, 143, 5, NULL),
  ('ST18', 'Polytechnic Gate Stop', 'Polytechnic Gate, north road',                          8,  655,  57, 4, NULL),
  ('ST19', 'TSLA Gate Stop',        'TSLAS Gate, east road',                                 8, 1155, 282, 4, NULL);

-- ---------------------------------------------------------------------------
-- 1. Fold the Phase 1 development stations into their campus stops.
-- ---------------------------------------------------------------------------
UPDATE stations s
SET code = c.code, name = c.name, location = c.location
FROM campus_stops c
WHERE c.legacy IS NOT NULL
  AND s.name = c.legacy
  AND s.code IS NULL
  AND NOT EXISTS (SELECT 1 FROM stations x WHERE x.code = c.code)
  AND NOT EXISTS (SELECT 1 FROM stations x WHERE x.name = c.name);

-- ---------------------------------------------------------------------------
-- 2. Create missing stops, then fill in any missing map position.
-- ---------------------------------------------------------------------------
INSERT INTO stations (code, name, location, capacity, status, map_x, map_y)
SELECT c.code, c.name, c.location, c.capacity, 'ACTIVE',
       ROUND(c.px * 100.0 / 1280, 3), ROUND(c.py * 100.0 / 720, 3)
FROM campus_stops c
WHERE NOT EXISTS (SELECT 1 FROM stations s WHERE s.code = c.code OR s.name = c.name);

UPDATE stations s
SET map_x = ROUND(c.px * 100.0 / 1280, 3),
    map_y = ROUND(c.py * 100.0 / 720, 3)
FROM campus_stops c
WHERE s.code = c.code AND s.map_x IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Demonstration fleet. Codes CC-<stop>-<n>, QR CC-QR-<stop>-<n>.
--    Each code is created at most once and never past station capacity.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  stop   RECORD;
  n      INTEGER;
  code   TEXT;
  parked INTEGER;
BEGIN
  FOR stop IN
    SELECT s.id, s.capacity, c.code AS stop_code, c.fleet
    FROM campus_stops c JOIN stations s ON s.code = c.code
    ORDER BY c.code
  LOOP
    FOR n IN 1..stop.fleet LOOP
      code := 'CC-' || substr(stop.stop_code, 3) || '-' || n;
      CONTINUE WHEN EXISTS (SELECT 1 FROM bicycles WHERE cycle_code = code);
      SELECT COUNT(*) INTO parked FROM bicycles WHERE station_id = stop.id;
      EXIT WHEN parked >= stop.capacity;
      INSERT INTO bicycles (cycle_code, qr_code, station_id, status, model)
      VALUES (code, 'CC-QR-' || substr(stop.stop_code, 3) || '-' || n, stop.id, 'AVAILABLE',
              CASE WHEN n % 3 = 0 THEN 'Hero Sprint 26T' ELSE 'Btwin MyBike City' END);
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Demo accounts (inserted only when the email is free).
-- ---------------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role)
SELECT 'Admin User', 'admin@campuscycle.edu', crypt('Admin@123', gen_salt('bf', 10)), 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@campuscycle.edu');

INSERT INTO users (name, email, password_hash, role)
SELECT 'Demo Student', 'student@campuscycle.edu', crypt('Student@123', gen_salt('bf', 10)), 'STUDENT'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'student@campuscycle.edu');

-- ---------------------------------------------------------------------------
-- 5. Sample completed rides for the analytics and history screens.
--    Only on a database where no CC fleet bicycle has ever been ridden.
-- ---------------------------------------------------------------------------
INSERT INTO rentals (user_id, bicycle_id, start_station_id, end_station_id,
                     started_at, ended_at, status)
SELECT u.id, b.id, s1.id, s2.id,
       date_trunc('day', NOW()) - (v.days_ago || ' days')::interval + (v.start_hour || ' hours')::interval,
       date_trunc('day', NOW()) - (v.days_ago || ' days')::interval + (v.start_hour || ' hours')::interval
         + (v.minutes || ' minutes')::interval,
       'COMPLETED'
FROM (VALUES
  ('student@campuscycle.edu', 'CC-11-1', 'ST11', 'ST04', 13,  8, 7),
  ('student@campuscycle.edu', 'CC-04-1', 'ST04', 'ST02', 13, 13, 5),
  ('student@campuscycle.edu', 'CC-02-1', 'ST02', 'ST11', 12, 18, 9),
  ('student@campuscycle.edu', 'CC-16-1', 'ST16', 'ST06', 11,  9, 11),
  ('student@campuscycle.edu', 'CC-06-1', 'ST06', 'ST07', 10, 17, 6),
  ('student@campuscycle.edu', 'CC-07-1', 'ST07', 'ST16', 10, 19, 8),
  ('student@campuscycle.edu', 'CC-13-1', 'ST13', 'ST04',  8,  8, 12),
  ('student@campuscycle.edu', 'CC-04-2', 'ST04', 'ST05',  7, 11, 4),
  ('student@campuscycle.edu', 'CC-05-1', 'ST05', 'ST01',  6, 16, 10),
  ('student@campuscycle.edu', 'CC-01-1', 'ST01', 'ST12',  5, 10, 9),
  ('student@campuscycle.edu', 'CC-12-1', 'ST12', 'ST03',  4,  9, 7),
  ('student@campuscycle.edu', 'CC-03-1', 'ST03', 'ST02',  3, 13, 3),
  ('student@campuscycle.edu', 'CC-02-2', 'ST02', 'ST15',  2, 14, 6),
  ('student@campuscycle.edu', 'CC-15-1', 'ST15', 'ST06',  1,  9, 8),
  ('student@campuscycle.edu', 'CC-06-2', 'ST06', 'ST11',  1, 17, 10)
) AS v(email, cycle_code, from_code, to_code, days_ago, start_hour, minutes)
JOIN users    u  ON u.email = v.email
JOIN bicycles b  ON b.cycle_code = v.cycle_code
JOIN stations s1 ON s1.code = v.from_code
JOIN stations s2 ON s2.code = v.to_code
WHERE NOT EXISTS (
  SELECT 1 FROM rentals r JOIN bicycles bb ON bb.id = r.bicycle_id
  WHERE bb.cycle_code LIKE 'CC-%'
);

COMMIT;

-- Summary (printed by the seed runner).
SELECT
  (SELECT COUNT(*) FROM stations WHERE code IS NOT NULL)   AS campus_stops,
  (SELECT COUNT(*) FROM stations WHERE map_x IS NOT NULL)  AS stops_on_map,
  (SELECT COUNT(*) FROM stations WHERE map_x IS NULL)      AS stops_not_on_map,
  (SELECT COUNT(*) FROM bicycles)                          AS bicycles,
  (SELECT COUNT(*) FROM users)                             AS users,
  (SELECT COUNT(*) FROM rentals)                           AS rentals;
