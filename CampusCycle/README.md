# 🚲 CampusCycle — Smart Campus Bicycle Sharing & Mobility Management

CampusCycle is a full-stack web application for running a **campus bicycle-sharing
service**. Students find a cycle on the campus map, unlock it by scanning its QR
label, ride, and return it at any station with a free dock. Administrators manage
the fleet, the stations and their positions on the map, rides, maintenance reports
and usage analytics from a dedicated console.

The campus map is the project's own **illustrated campus map**, with 19 proposed
bicycle stops placed beside the buildings, hostels, gates and sports facilities it
shows, and routes that follow the roads drawn on it.

---

## Contents

1. [Features](#features)
2. [What is real and what is simulated](#what-is-real-and-what-is-simulated)
3. [Technology stack](#technology-stack)
4. [Project structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [PostgreSQL setup](#postgresql-setup)
7. [Environment variables](#environment-variables)
8. [Database migrations and seeds](#database-migrations-and-seeds)
9. [Running the application](#running-the-application)
10. [Demo accounts](#demo-accounts)
11. [The campus map](#the-campus-map)
12. [Testing](#testing)
13. [API reference](#api-reference)
14. [Data model and safety design](#data-model-and-safety-design)
15. [Security notes](#security-notes)
16. [Known limitations](#known-limitations)

---

## Features

### Student

- **Accounts** — register / log in (JWT), protected routes, role-based access, sign out.
- **Dashboard** — current active ride with a live timer, cycles available on campus,
  station count, completed rides, a live campus-map preview, your recently used
  stations, recent ride history, quick access to issue reporting.
- **Campus map** (`/app/map`) — the illustrated campus map with zoom, pan and a reset
  control; a marker per station showing how many cycles are available; colour-coded
  states (available, few left, no cycles, full, temporarily unavailable) with a legend.
  Selecting a marker shows the station's availability, free docks, capacity and
  status, with actions to rent there, return there, or use it as a route start/end.
- **Route planner** — choose a pickup and a destination stop; the route is drawn
  along the campus roads with an approximate distance.
- **Station list** — a plain searchable/filterable list (on the map page and at
  `/app/stations`) for anyone who prefers not to use the map.
- **QR rental** — scan the bicycle's QR label with the phone camera, or type the code
  printed under it. The server validates the code, the bicycle's status and safety
  holds, the station's status and the one-ride-per-student rule before starting.
- **Return** — pick a return station (full or closed stations are shown but disabled);
  a ride-completion summary shows the route, duration and times.
- **Ride history** — bicycle, start/end station, start/end time, duration and status,
  with filters and per-ride detail pages.
- **Maintenance reports** — brakes, flat or damaged tyre, chain, light, seat, damaged
  bicycle (frame/handlebar), QR code problems or anything else; high-severity reports
  immediately take the cycle out of service.

### Admin

- **Overview** — registered students, bicycles (working fleet), available, currently
  rented, stations (active / full / empty), active rides, completed rides, pending
  maintenance, recent rides. Every figure is a live database aggregate.
- **Bicycles** — add, edit (code, QR value, model, station, status), send to / return
  from maintenance, retire and reinstate, delete (only if never ridden), printable QR
  labels, per-bicycle ride history, filters by status and station.
- **Stations** — add and edit (stop code, name, location, capacity, status), set the
  map position by clicking or dragging on the map, activate / deactivate, view
  occupancy and the bicycles parked at each station.
- **Campus map** (`/admin/map`) — move any station directly on the map and save; place
  stations that are not on the map yet; overlay the traced road network.
- **Rides** — all rides with search (student name/email, cycle code), status, bicycle,
  station and date filters, pagination, and force-return of a stuck ride.
- **Maintenance** — filter reports, view the bicycle, move reports through
  OPEN → IN_PROGRESS → RESOLVED → CLOSED with required resolution notes.
- **Analytics** — rides per day and per week, completion rate, peak hour, most-used
  stations, most-rented bicycles, usage by hour, fleet status, maintenance by
  severity and a weekly reported-vs-resolved maintenance trend, all for a chosen
  date range.
- **Geofence alerts** — boundary-violation alerts driven by *simulated* GPS readings
  (see below).

---

## What is real and what is simulated

| Feature | Status |
| --- | --- |
| Accounts, rides, returns, availability, history, maintenance, analytics | **Real** — stored in and computed by PostgreSQL |
| QR scanning | **Real** camera scanning in the browser (native `BarcodeDetector`, `jsQR` fallback). Labels are generated and printed from the admin console. |
| Unlocking / docking | **Simulated in software.** Starting a ride records it and marks the cycle in use; no physical lock is controlled. Returning records the cycle at the chosen station; no dock sensor confirms it. |
| Station locations | **Proposed** stop positions for this project, not existing infrastructure. |
| Route distance | **Approximate**, derived from the illustrated map's scale (see [The campus map](#the-campus-map)). No travel time is estimated. |
| Geofencing | **Simulated.** Bicycles have no GPS; an admin submits demonstration locations, labelled `SIMULATED`. |

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6, Axios, Lucide icons, Leaflet (non-geographic `CRS.Simple` mode) for the campus map, Recharts, `qrcode`, `jsqr` |
| Backend | Node.js 18+, Express 4, JSON Web Tokens (HS256), bcryptjs, Helmet, CORS |
| Database | PostgreSQL (`pg` driver, connection pooling, transactions, row locks, partial unique indexes, triggers) |

---

## Project structure

```
CampusCycle/
├── backend/
│   └── src/
│       ├── config/        env loading/validation, PostgreSQL pool + withTransaction()
│       ├── data/          campus-map.json — map image metadata, scale, traced road network
│       ├── middleware/    authenticate, authorize(role), rate limiter, error handler
│       ├── models/        SQL data access (users, stations, bicycles, rentals, maintenance, …)
│       ├── services/      business rules (rental, station, bicycle, route planning, analytics, …)
│       ├── controllers/   thin HTTP handlers
│       ├── routes/        REST routes (all under /api)
│       ├── scripts/       migrate / seed runners (+ a guard against wiping real data)
│       ├── tests/         route unit test + three end-to-end suites
│       ├── app.js         Express app
│       └── server.js      HTTP server + graceful shutdown
├── database/
│   ├── schema.sql               base tables (DESTRUCTIVE — fresh databases only)
│   ├── migrations/              additive, idempotent migrations (002, 003)
│   ├── seed.sql                 Phase 1 demo data (DESTRUCTIVE — truncates)
│   ├── seed-phase2.sql          demo maintenance reports + geofence (non-destructive)
│   └── seed-campus.sql          19 campus stops, fleet, demo accounts, sample rides (non-destructive)
├── frontend/
│   ├── public/images/campus-map.png   the campus map, rotated upright
│   └── src/
│       ├── components/map/      CampusMap (Leaflet image map), legend, station summary
│       ├── components/admin/    station/bicycle forms, QR label, bicycle history
│       ├── components/charts/   Recharts wrappers + validated palette
│       ├── pages/student/       dashboard, campus map, stations, rides, reports, …
│       ├── pages/admin/         overview, bicycles, stations, map, rides, maintenance, analytics, …
│       └── services/            Axios client + API wrappers
└── README.md
```

---

## Prerequisites

- **Node.js 18+** and npm
- **PostgreSQL 13+** running locally on port **5432** (or a hosted PostgreSQL such as Neon)
- A modern browser. Camera scanning needs HTTPS or `localhost`.

---

## PostgreSQL setup

```bash
# create the development database (and, for the automated tests, a separate one)
createdb -U postgres campuscycle
createdb -U postgres campuscycle_test
```

The `pgcrypto` extension is enabled by the seed scripts (used to hash demo passwords).

---

## Environment variables

Copy the examples and fill in real values. **Never commit `.env` files** — they are
git-ignored.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # optional
```

### `backend/.env`

| Variable | Purpose | Example |
| --- | --- | --- |
| `PORT` | API port | `4000` |
| `CLIENT_ORIGIN` | Allowed browser origin(s) for CORS, comma-separated | `http://localhost:5175` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:PASSWORD@localhost:5432/campuscycle` |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | Used when `DATABASE_URL` is not set (and by the test-database helper) | `localhost` `5432` `campuscycle` … |
| `DB_SOURCE` | `local` = ignore `CampusCycle/.env.local` (Neon) and use this file; `auto` (default) = Neon settings in `.env.local` take precedence | `local` |
| `JWT_SECRET` | Token signing secret — **at least 32 random characters** (the server refuses a weak one in production) | `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `BCRYPT_ROUNDS` | Password hashing cost | `10` |
| `APP_TIMEZONE` | Timezone for analytics day/hour buckets | `Asia/Kolkata` |

`neon env pull` writes Neon connection strings to `CampusCycle/.env.local`
(`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` direct). With `DB_SOURCE=auto` those
win; set `DB_SOURCE=local` in `backend/.env` to develop against local PostgreSQL.

### `frontend/.env` (optional)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL. Defaults to `/api`, which the Vite dev server proxies to `http://localhost:4000`. |

---

## Database migrations and seeds

All commands run from `CampusCycle/backend` (or from `CampusCycle/` with the same
`npm run …` names).

| Command | What it does | Safe on real data? |
| --- | --- | --- |
| `npm run db:update` | Applies every migration in `database/migrations/`, then `seed-campus.sql` | ✅ yes — additive and idempotent |
| `npm run db:migrate:phase2` | Applies the migrations only | ✅ yes |
| `npm run db:seed:campus` | Campus stops, fleet, demo accounts, sample rides | ✅ yes — never overwrites or deletes |
| `npm run db:seed:phase2` | Demo maintenance reports (only if none exist) + geofence | ✅ yes |
| `npm run db:setup` | **Rebuilds everything from scratch**: schema + migrations + all seeds | ⚠️ destructive |
| `npm run db:migrate` / `npm run db:seed` | Base schema / Phase 1 seed | ⚠️ destructive |

The destructive scripts **refuse to run** when the database already has users,
unless you pass `-- --yes-reset`.

**Existing database** (keeps all users and data):

```bash
cd backend
npm run db:update
```

**Brand-new empty database:**

```bash
cd backend
npm run db:setup
```

`seed-campus.sql` folds the six Phase 1 development stations (Library, Hostel A,
Hostel B, Academic Block, Cafeteria, Sports Complex) into the matching campus stops so
their bicycles and ride history are preserved, creates the remaining stops, adds a
demonstration fleet (codes `CC-<stop>-<n>`, QR values `CC-QR-<stop>-<n>`) without ever
exceeding a station's capacity, ensures the demo accounts exist, and — only on a
database where no `CC-` bicycle has been ridden — adds 15 dated sample rides.

---

## Running the application

```bash
# one-time
cd CampusCycle
npm run install:all          # root + backend + frontend dependencies

# terminal 1 — API on http://localhost:4000
cd CampusCycle/backend
npm run dev

# terminal 2 — web app on http://localhost:5175
cd CampusCycle/frontend
npm run dev
```

Or both at once from `CampusCycle/`: `npm run dev`.

Open **http://localhost:5175**. Health check: `http://localhost:4000/api/health`.

**Scanning from a phone:** browsers only allow the camera on HTTPS or `localhost`.
For a phone on the same network, serve the frontend over HTTPS (for example a Vercel
preview, or Vite with an HTTPS certificate). Manual code entry works everywhere.

**Production build:** `cd frontend && npm run build` → static files in `frontend/dist/`.

---

## Demo accounts

Demo credentials are kept in **`DEMO_CREDENTIALS.local.md`** in your local checkout
(git-ignored, created alongside this release). `seed-campus.sql` creates one demo
admin and one demo student if those emails are not registered yet.

> The demo passwords also appear in `database/seed.sql` / `seed-campus.sql`, which are
> public in the repository. They are for local demonstrations only — never use them on
> a deployed system, and change or remove these accounts before going live.

---

## The campus map

- **Image:** `frontend/public/images/campus-map.png` (1280 × 720) — the supplied map,
  cropped from the phone screenshot and rotated 90° so every label reads upright.
  The artwork itself is unchanged.
- **Coordinates:** the map is an illustration, not a georeferenced image, so stations
  are **not** stored as latitude/longitude. `stations.map_x` / `map_y` hold the
  position as a **percentage (0–100) of the image width and height** from the top-left
  corner. Leaflet renders the image in its non-geographic `CRS.Simple` mode, so
  markers stay on their building at any screen size and zoom level.
- **Stops:** 19 proposed stops (ST01–ST19), named after the buildings printed on the
  map. Two corrections were made against the original brief after reading the map:
  Hostel A is **Agira Hall** and Hostel B is **Amritam Hall** (Anantam Hall is Hostel M);
  Himadri and Vindhya halls do not appear on this map, so ST16/ST17 serve **Anantam
  Hall (Hostel M)** and **Ambaram Hall (Hostel K)** instead.
- **Editing positions:** Admin → Campus map → select a station → *Move* → click or
  drag → *Save position*. Or Admin → Stations → edit → click the map. Positions live in
  the database; no code change is needed.
- **Roads and routes:** `backend/src/data/campus-map.json` holds the road network,
  traced by hand over the roads drawn on the map (in image pixels). A route snaps both
  stations to the nearest road and runs Dijkstra's shortest path, so it never cuts
  through buildings. If you move a station off the roads, the route planner warns that
  the first/last leg is a straight line.
- **Distance:** the scale is calibrated from the synthetic running track on the map
  (a standard 400 m track is ~92 × 176 m; on the image it is ~65 × 125 px → ~1.4 m/px).
  Because the artwork is not survey-accurate, distances are shown as approximate and
  rounded; no walking or riding time is estimated.

---

## Testing

The end-to-end suites **erase their database**, so they only run against a database
whose name ends in `_test` (they refuse anything else). By default they use your
`DB_*` settings with the database name `<DB_NAME>_test`; or set `TEST_DATABASE_URL`.

```bash
createdb -U postgres campuscycle_test     # once

cd backend
npm run test:route          # road network + routing unit tests (no database)
npm run test:e2e            # Phase 1: rent/return, RBAC, invalid rentals, race
npm run test:e2e:phase2     # Phase 2: map data, history, maintenance, analytics, geofence
npm run test:e2e:campus     # campus release: full student + admin workflows, edge cases
npm run test:all            # all of the above
```

`test:e2e:campus` covers registration and login validation, forged/unsigned/stale
tokens, role checks on admin endpoints, the auth rate limiter, the map and route
endpoints, QR rental (including invalid codes, duplicate rentals and unavailable or
retired cycles), returns (to full and to closed stations, someone else's ride,
completed rides), availability updates, two students racing for one bicycle, two
riders racing for the last free dock, the database capacity trigger, maintenance
reporting and resolution, admin bicycle/station management, ride search, analytics,
and an empty database.

**Browser flow (optional):** `frontend/tests/campus-flow.mjs` drives the real UI with
Playwright (student + admin workflows, mobile layout, marker placement under zoom).
It writes to the database behind the API, so run it against a backend pointed at the
test database — instructions are at the top of the file.

---

## API reference

All routes are under `/api`. Protected routes need `Authorization: Bearer <token>`.
Admin-only routes return **403** to students; missing/invalid tokens return **401**.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | public (rate-limited) | Register a **student** |
| POST | `/auth/login` | public (rate-limited) | `{ token, user }` |
| GET / PATCH | `/auth/me` | any | Profile / update name |
| GET | `/map` | any | Map image, coordinate system, scale and road network |
| GET | `/map/route?from=&to=` | any | Road-following route between two stations |
| GET | `/stations` | any | Stations with availability (`?availability=GOOD\|LOW\|NONE\|FULL\|INACTIVE`, `?status=`, `?sort=`) |
| GET | `/stations/map` | any | Map config + stations on the map + unplaced stations + totals |
| GET | `/stations/:id` | any | One station |
| POST / PUT | `/stations`, `/stations/:id` | admin | Create / update (incl. `code`, `capacity`, `map_x`, `map_y`) |
| PATCH | `/stations/:id/status` | admin | Activate / deactivate |
| DELETE | `/stations/:id` | admin | Delete (only when empty and unreferenced by active rides) |
| GET | `/bicycles` | any | List (`?status=`, `?station_id=`, `?search=`); `qr_code` only for admins |
| GET | `/bicycles/lookup?code=` | any | Find a bicycle by QR value or printed code |
| GET | `/bicycles/stats` | admin | Counts by status (+ `FLEET`, `TOTAL`) |
| POST / PUT | `/bicycles`, `/bicycles/:id` | admin | Create / update (incl. `model`) |
| PATCH | `/bicycles/:id/status` | admin | Status change, incl. `RETIRED` |
| DELETE | `/bicycles/:id` | admin | Delete a never-ridden bicycle |
| POST | `/rentals` | student | Start a ride `{ qr_code }` |
| POST | `/rentals/:id/return` | owner / admin | End a ride `{ end_station_id }` |
| GET | `/rentals/active` | student | Current ride or `null` |
| GET | `/rentals/me` | any | Own rides |
| GET | `/rentals/:id` | owner / admin | One ride |
| GET | `/rentals` | admin | All rides (`?status=`, `?search=`, `?bicycle_id=`, `?station_id=`, `?user_id=`, `?from=`, `?to=`, paging) |
| POST | `/maintenance` | any | Report a problem |
| GET | `/maintenance/me` | any | Own reports |
| GET | `/maintenance`, `/maintenance/stats` | admin | All reports / counts |
| PATCH | `/maintenance/:id/status` | admin | Lifecycle change with notes |
| GET | `/admin/overview` | admin | Dashboard figures |
| GET | `/analytics?from=&to=` | admin | Lifetime + period figures, chart series, leaderboards |
| GET | `/users` | admin | User directory (no password hashes) |
| … | `/geofence/*` | admin (GET `/geofence`: any) | Simulated-location geofencing |
| GET | `/health` | public | Health check |

---

## Data model and safety design

Tables: `users`, `stations`, `bicycles`, `rentals`, `maintenance_reports`,
`geofence_config`, `bicycle_location_pings`, `geofence_events`.

Rules enforced **by PostgreSQL**, not just the application:

- At most one `ACTIVE` ride per student and per bicycle (partial unique indexes).
- Valid statuses for bicycles (`AVAILABLE`, `RESERVED`, `IN_USE`, `MAINTENANCE`,
  `RETIRED`), rides, stations and reports (`CHECK` constraints).
- An `IN_USE` bicycle is never parked; an `AVAILABLE`/`RESERVED` one always is.
- **A station can never hold more bicycles than its capacity** — a trigger locks the
  station row and counts, so concurrent returns cannot both take the last dock.
- Map positions are 0–100 and always paired; stop codes are unique.
- Foreign keys with `RESTRICT`, so history is never orphaned; indexes on every foreign
  key and on the analytics/time columns.

Transactions with row locks (`SELECT … FOR UPDATE`) wrap every state change:
renting locks the student's active rides and the bicycle; returning locks the ride,
the destination station and the bicycle; maintenance and admin status changes lock
the bicycle. A bicycle with an unresolved HIGH/CRITICAL report is on **safety hold**
and cannot be rented or returned to service by any route.

---

## Security notes

- Passwords hashed with bcrypt; hashes are never returned by the API.
- JWTs are HS256-only (unsigned or other-algorithm tokens are rejected), and each
  request re-reads the user's role from the database, so a deleted account or a role
  change takes effect immediately.
- Admin authorisation is enforced on the server for every admin endpoint; the
  frontend role checks are only for navigation.
- Every request body is validated server-side; all SQL is parameterised (search text
  is matched literally — `%` and `_` are escaped).
- Login (20 per 15 min) and registration (10 per hour) are rate-limited per IP.
- CORS allows only the configured frontend origin(s); Helmet sets security headers;
  JSON bodies are capped at 100 kB; errors never leak stack traces outside development.
- QR values are only sent to admins, so a student must read the code off the bicycle.
- `.env` and `.env.local` are git-ignored; no secrets have been committed to this
  repository's history.

---

## Known limitations

- No hardware: locks, docks and GPS are simulated (see the table at the top).
- Route distances are approximate (illustrated map); there are no travel times.
- The geofence works on simulated latitude/longitude readings, which cannot be drawn
  on the illustrated map; it is managed from the Geofence Alerts page.
- "Nearby stations" cannot be computed without location access; the dashboard shows
  your recently used stations instead (or the stations with the most cycles).
- The rate limiter is in-memory and per process; use a shared store if you run more
  than one API instance.
- Camera scanning needs HTTPS (or localhost) and a browser with camera access.
