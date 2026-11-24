'use strict';

/**
 * End-to-end suite for the campus-map release, run against the FULL seed
 * (schema + migrations + seed.sql + seed-phase2.sql + seed-campus.sql).
 *
 *   M. Seeding: 19 campus stops on the map, idempotent re-run, demo accounts.
 *   N. Authentication & authorisation: register/login validation, forged and
 *      stale tokens, student blocked from admin APIs, rate limiter.
 *   O. Campus map & routing endpoints.
 *   P. Student workflow: QR rental, active ride, return, availability
 *      updates, history — plus every rejection path.
 *   Q. Concurrency: two students racing for one bike; two riders racing for
 *      the last free dock; DB-level capacity trigger.
 *   R. Maintenance reporting (new categories) and admin resolution.
 *   S. Admin workflow: overview, bicycles (create/edit/retire), stations
 *      (create/move/capacity), ride search, analytics.
 *   T. Empty-database behaviour.
 *
 * Usage:  npm run test:e2e:campus   (from backend/; needs a *_test database)
 */

// Must be first: selects the *_test database and refuses any other.
const { assertTestDatabase } = require('./testDb');

const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { pool } = require('../config/db');
const { rateLimit } = require('../middleware/rateLimit');

const DB_DIR = path.join(__dirname, '..', '..', '..', 'database');
const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations');

let passed = 0;
let failed = 0;
let base = '';

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  ✔', message);
  } else {
    failed += 1;
    console.error('  ✖', message);
  }
}

async function api(method, endpoint, { token, body, rawAuth } = {}) {
  const res = await fetch(base + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rawAuth ? { Authorization: rawAuth } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  return { status: res.status, data };
}

async function login(email, password) {
  const { data } = await api('POST', '/api/auth/login', { body: { email, password } });
  return data && data.token;
}

/** Students read the QR value off the label; tests read it from the DB. */
async function qrOf(cycleCode) {
  const { rows } = await pool.query('SELECT qr_code FROM bicycles WHERE cycle_code = $1', [cycleCode]);
  return rows[0].qr_code;
}

const read = (p) => fs.readFileSync(p, 'utf8');

async function resetDatabase() {
  await pool.query(read(path.join(DB_DIR, 'schema.sql')));
  for (const name of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(read(path.join(MIGRATIONS_DIR, name)));
  }
  await pool.query(read(path.join(DB_DIR, 'seed.sql')));
  await pool.query(read(path.join(DB_DIR, 'seed-phase2.sql')));
  await pool.query(read(path.join(DB_DIR, 'seed-campus.sql')));
}

async function counts() {
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM stations) st, (SELECT COUNT(*)::int FROM bicycles) b,
    (SELECT COUNT(*)::int FROM users) u, (SELECT COUNT(*)::int FROM rentals) r`);
  return rows[0];
}

async function stationByCode(code, token) {
  const list = (await api('GET', '/api/stations', { token })).data.stations;
  return list.find((s) => s.code === code);
}

async function main() {
  console.log('Resetting database (schema + migrations + all seeds)...');
  await assertTestDatabase(pool);
  await resetDatabase();

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log('Test server listening on', base);

  try {
    // ---- M. Seeding --------------------------------------------------------
    console.log('\nScenario M — campus seed');
    const before = await counts();
    await pool.query(read(path.join(DB_DIR, 'seed-campus.sql')));
    const after = await counts();
    check(
      JSON.stringify(before) === JSON.stringify(after),
      `re-running seed-campus.sql changes nothing (${JSON.stringify(after)})`
    );
    const codes = (
      await pool.query(`SELECT code FROM stations WHERE code ~ '^ST[0-9]{2}$' AND map_x IS NOT NULL ORDER BY code`)
    ).rows.map((r) => r.code);
    check(codes.length === 19 && codes[0] === 'ST01' && codes[18] === 'ST19', '19 campus stops ST01–ST19 are on the map');
    const legacy = (await pool.query(`SELECT COUNT(*)::int n FROM stations WHERE name IN ('Library','Hostel A','Cafeteria')`)).rows[0].n;
    check(legacy === 0, 'Phase 1 development stations were folded into their campus stops');
    const overCap = (
      await pool.query(`SELECT COUNT(*)::int n FROM stations s
        WHERE (SELECT COUNT(*) FROM bicycles b WHERE b.station_id = s.id) > s.capacity`)
    ).rows[0].n;
    check(overCap === 0, 'no station holds more bicycles than its capacity');

    const admin = await login('admin@campuscycle.edu', 'Admin@123');
    const demo = await login('student@campuscycle.edu', 'Student@123');
    check(!!admin && !!demo, 'demo admin and demo student can log in');

    // ---- N. Auth & authorisation ------------------------------------------
    console.log('\nScenario N — authentication and authorisation');
    const reg = await api('POST', '/api/auth/register', {
      body: { name: 'Priya Test', email: 'Priya.Test@campuscycle.edu', password: 'Cycle2026' },
    });
    check(reg.status === 201 && reg.data.user.role === 'STUDENT', 'a student can register (role forced to STUDENT)');
    check(!('password_hash' in reg.data.user), 'the response never contains a password hash');
    check(reg.data.user.email === 'priya.test@campuscycle.edu', 'email is normalised to lower case');
    const priya = reg.data.token;
    check(
      (await api('POST', '/api/auth/register', {
        body: { name: 'X', email: 'priya.test@campuscycle.edu', password: 'Cycle2026' },
      })).status === 409,
      'duplicate email -> 409'
    );
    const weak = await api('POST', '/api/auth/register', {
      body: { name: 'X', email: 'weak@campuscycle.edu', password: 'short' },
    });
    check(weak.status === 422 && weak.data.details.password, 'weak password -> 422 with a field error');
    check(
      (await api('POST', '/api/auth/register', { body: { name: '', email: 'nope', password: 'Cycle2026' } }))
        .status === 422,
      'invalid email and empty name -> 422'
    );
    const roleEscalation = await api('POST', '/api/auth/register', {
      body: { name: 'Sneaky', email: 'sneaky@campuscycle.edu', password: 'Cycle2026', role: 'ADMIN' },
    });
    check(roleEscalation.data.user.role === 'STUDENT', 'registering with role=ADMIN still creates a STUDENT');

    const badLogin = await api('POST', '/api/auth/login', {
      body: { email: 'student@campuscycle.edu', password: 'WrongPass1' },
    });
    check(badLogin.status === 401 && /invalid email or password/i.test(badLogin.data.error), 'wrong password -> 401 (generic message)');
    check(
      (await api('POST', '/api/auth/login', { body: { email: 'ghost@campuscycle.edu', password: 'WrongPass1' } })).status === 401,
      'unknown email -> 401 with the same message'
    );

    check((await api('GET', '/api/admin/overview', { token: demo })).status === 403, 'student -> admin overview 403');
    check((await api('GET', '/api/analytics', { token: demo })).status === 403, 'student -> analytics 403');
    check((await api('POST', '/api/stations', { token: demo, body: {} })).status === 403, 'student -> create station 403');
    check((await api('GET', '/api/rentals', { token: demo })).status === 403, 'student -> all rentals 403');
    check((await api('GET', '/api/users', { token: demo })).status === 403, 'student -> user list 403');
    check((await api('GET', '/api/stations')).status === 401, 'no token -> 401');
    const forged = jwt.sign({ id: 1, role: 'ADMIN' }, 'not-the-real-secret');
    check((await api('GET', '/api/admin/overview', { token: forged })).status === 401, 'token signed with the wrong secret -> 401');
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"id":1,"role":"ADMIN"}').toString('base64url')}.`;
    check((await api('GET', '/api/admin/overview', { token: noneAlg })).status === 401, 'unsigned alg=none token -> 401');
    const sneakyId = roleEscalation.data.user.id;
    const sneakyToken = roleEscalation.data.token;
    await pool.query('DELETE FROM users WHERE id = $1', [sneakyId]);
    check((await api('GET', '/api/auth/me', { token: sneakyToken })).status === 401, 'token of a deleted account -> 401');

    // Rate limiter (isolated app so the shared limiter is not exhausted).
    const limited = express();
    limited.post('/x', rateLimit({ windowMs: 60_000, max: 2 }), (req, res) => res.json({ ok: true }));
    const ls = limited.listen(0);
    await new Promise((r) => ls.once('listening', r));
    const lurl = `http://127.0.0.1:${ls.address().port}/x`;
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await fetch(lurl, { method: 'POST' })).status);
    ls.close();
    check(statuses.join(',') === '200,200,429', `auth rate limiter blocks the 3rd request in the window (${statuses})`);

    // ---- O. Map & routing --------------------------------------------------
    console.log('\nScenario O — campus map and routing');
    const mapCfg = await api('GET', '/api/map', { token: priya });
    check(mapCfg.status === 200 && mapCfg.data.map.image.url === '/images/campus-map.png', 'map config points at the campus map image');
    check(mapCfg.data.map.roads.length > 20, 'map config includes the traced road network');
    const mapData = (await api('GET', '/api/stations/map', { token: priya })).data;
    check(mapData.stations.length === 19 && mapData.unmapped_stations.length === 0, '/api/stations/map returns 19 stations, none unmapped');
    check(mapData.stations.every((s) => s.map_x >= 0 && s.map_x <= 100 && s.map_y >= 0 && s.map_y <= 100), 'every marker position is a 0–100 percentage');
    const names = mapData.stations.map((s) => s.name);
    check(
      ['Main Entrance Stop', 'Polytechnic Gate Stop', 'TSLA Gate Stop', 'Agira Hall Stop', 'Neeram Hall Stop', 'Viyat Hall Stop'].every((n) => names.includes(n)),
      'stops use the building names printed on the map'
    );

    const st13 = await stationByCode('ST13', priya);
    const st01 = await stationByCode('ST01', priya);
    const route = await api('GET', `/api/map/route?from=${st13.id}&to=${st01.id}`, { token: priya });
    check(route.status === 200 && route.data.route.path.length >= 2, 'route Neeram Hall -> Main Entrance is returned');
    check(route.data.route.roads.includes('Bottom road'), 'it follows the bottom road');
    check(route.data.route.distance.approximate === true && route.data.route.distance.approx_metres > 0, 'distance is labelled approximate');
    check(!('minutes' in route.data.route) && !('duration' in route.data.route), 'no travel time is invented');
    check((await api('GET', `/api/map/route?from=${st13.id}&to=${st13.id}`, { token: priya })).status === 422, 'same start and end -> 422');
    check((await api('GET', `/api/map/route?from=${st13.id}`, { token: priya })).status === 422, 'missing destination -> 422');
    check((await api('GET', `/api/map/route?from=${st13.id}&to=999999`, { token: priya })).status === 404, 'unknown station -> 404');
    check((await api('GET', `/api/map/route?from=1&to=2`)).status === 401, 'routing requires login');

    // ---- P. Student workflow ----------------------------------------------
    console.log('\nScenario P — QR rental, active ride, return, history');
    const lib = await stationByCode('ST04', priya);
    const agira = await stationByCode('ST11', priya);
    const libBikes = (await api('GET', `/api/bicycles?station_id=${lib.id}&status=AVAILABLE`, { token: priya })).data.bicycles;
    check(libBikes.length > 0 && libBikes.every((b) => b.qr_code === undefined), 'student sees available bikes at a station, without QR values');
    const bike = libBikes[0];

    check((await api('POST', '/api/rentals', { token: priya, body: { qr_code: 'CC-QR-NOPE' } })).status === 404, 'invalid QR -> 404');
    check((await api('POST', '/api/rentals', { token: priya, body: { qr_code: '   ' } })).status === 422, 'empty QR -> 422');
    check((await api('POST', `/api/rentals/999999/return`, { token: priya, body: { end_station_id: agira.id } })).status === 404, 'returning without an active ride -> 404');

    const qr = (await qrOf(bike.cycle_code)).toLowerCase(); // typed in lower case
    const start = await api('POST', '/api/rentals', { token: priya, body: { qr_code: qr } });
    check(start.status === 201 && start.data.rental.status === 'ACTIVE', 'manual QR entry starts a ride (case-insensitive)');
    check(start.data.rental.start_station_id === lib.id, 'start station recorded');
    const rideId = start.data.rental.id;
    const libAfter = await stationByCode('ST04', priya);
    check(libAfter.available_count === lib.available_count - 1, `pickup station availability drops (${lib.available_count} -> ${libAfter.available_count})`);

    const active = await api('GET', '/api/rentals/active', { token: priya });
    check(active.data.rental && active.data.rental.id === rideId && active.data.rental.duration_seconds >= 0, 'active ride is shown with elapsed time');

    const other = libBikes[1] || libBikes[0];
    check(
      (await api('POST', '/api/rentals', { token: priya, body: { qr_code: await qrOf(other.cycle_code) } })).status === 409,
      'a second simultaneous rental for the same student -> 409'
    );
    check(
      (await api('POST', '/api/rentals', { token: demo, body: { qr_code: await qrOf(bike.cycle_code) } })).status === 409,
      'renting a bicycle that is already in use -> 409'
    );

    // Returning to a full station and to an inactive one is refused.
    const fullStation = (await api('GET', '/api/stations', { token: admin })).data.stations.find((s) => s.free_docks === 0);
    check(!!fullStation, `the seed has a full station to test with (${fullStation && fullStation.name})`);
    const toFull = await api('POST', `/api/rentals/${rideId}/return`, { token: priya, body: { end_station_id: fullStation.id } });
    check(toFull.status === 409 && /full/i.test(toFull.data.error), 'returning to a full station -> 409');
    const st19 = await stationByCode('ST19', admin);
    await api('PATCH', `/api/stations/${st19.id}/status`, { token: admin, body: { status: 'INACTIVE' } });
    check(
      (await api('POST', `/api/rentals/${rideId}/return`, { token: priya, body: { end_station_id: st19.id } })).status === 409,
      'returning to a temporarily unavailable station -> 409'
    );
    const st19Bike = (await api('GET', `/api/bicycles?station_id=${st19.id}&status=AVAILABLE`, { token: admin })).data.bicycles[0];
    check(
      (await api('POST', '/api/rentals', { token: demo, body: { qr_code: st19Bike.qr_code } })).status === 409,
      'renting from a temporarily unavailable station -> 409'
    );
    await api('PATCH', `/api/stations/${st19.id}/status`, { token: admin, body: { status: 'ACTIVE' } });
    check(
      (await api('POST', `/api/rentals/${rideId}/return`, { token: demo, body: { end_station_id: agira.id } })).status === 403,
      "a student cannot end someone else's ride -> 403"
    );

    const ret = await api('POST', `/api/rentals/${rideId}/return`, { token: priya, body: { end_station_id: agira.id } });
    check(ret.status === 200 && ret.data.rental.status === 'COMPLETED', 'ride completes at the chosen station');
    check(ret.data.rental.end_station_id === agira.id && !!ret.data.rental.ended_at, 'end station and end time recorded');
    check(typeof ret.data.rental.duration_seconds === 'number', 'ride duration is calculated');
    const agiraAfter = await stationByCode('ST11', priya);
    check(agiraAfter.available_count === agira.available_count + 1, `return station availability rises (${agira.available_count} -> ${agiraAfter.available_count})`);
    check(
      (await api('POST', `/api/rentals/${rideId}/return`, { token: priya, body: { end_station_id: agira.id } })).status === 409,
      'returning an already-completed ride -> 409'
    );

    const history = (await api('GET', '/api/rentals/me', { token: priya })).data.rentals;
    const h = history.find((r) => r.id === rideId);
    check(
      h && h.bicycle_code === bike.cycle_code && h.start_station_name === lib.name && h.end_station_name === agira.name && h.status === 'COMPLETED',
      'ride history shows bicycle, start/end station, times and status'
    );

    // ---- Q. Concurrency ----------------------------------------------------
    console.log('\nScenario Q — concurrency and capacity');
    const r1 = await api('POST', '/api/auth/register', { body: { name: 'Racer One', email: 'racer1@campuscycle.edu', password: 'Cycle2026' } });
    const r2 = await api('POST', '/api/auth/register', { body: { name: 'Racer Two', email: 'racer2@campuscycle.edu', password: 'Cycle2026' } });
    const racers = [r1.data.token, r2.data.token];
    const raceBike = (await api('GET', `/api/bicycles?station_id=${agira.id}&status=AVAILABLE`, { token: admin })).data.bicycles[0];
    const race = await Promise.all(racers.map((t) => api('POST', '/api/rentals', { token: t, body: { qr_code: raceBike.qr_code } })));
    check(race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409).length === 1,
      'two students scanning the same bicycle at once: exactly one wins');

    // Give the loser a different bike so both are riding, then race them for
    // the last free dock of a small station.
    const loser = race[0].status === 201 ? 1 : 0;
    const secondBike = (await api('GET', `/api/bicycles?station_id=${agira.id}&status=AVAILABLE`, { token: admin })).data.bicycles[0];
    const second = await api('POST', '/api/rentals', { token: racers[loser], body: { qr_code: secondBike.qr_code } });
    check(second.status === 201, 'second racer starts a ride on another bicycle');
    const tiny = await api('POST', '/api/stations', {
      token: admin,
      body: { code: 'TST1', name: 'One-Dock Test Stop', location: 'Test', capacity: 1, map_x: 50, map_y: 50 },
    });
    check(tiny.status === 201 && tiny.data.station.free_docks === 1, 'admin creates a one-dock station');
    const rides = await Promise.all(racers.map((t) => api('GET', '/api/rentals/active', { token: t })));
    const returns = await Promise.all(
      racers.map((t, i) => api('POST', `/api/rentals/${rides[i].data.rental.id}/return`, { token: t, body: { end_station_id: tiny.data.station.id } }))
    );
    check(returns.filter((r) => r.status === 200).length === 1 && returns.filter((r) => r.status === 409).length === 1,
      'two riders returning to the last free dock at once: exactly one succeeds');
    const parkedTiny = (await pool.query('SELECT COUNT(*)::int n FROM bicycles WHERE station_id = $1', [tiny.data.station.id])).rows[0].n;
    check(parkedTiny === 1, 'the one-dock station holds exactly one bicycle');

    let triggerBlocked = false;
    try {
      await pool.query(`INSERT INTO bicycles (cycle_code, qr_code, station_id, status) VALUES ('ZZ-1','ZZ-QR-1',$1,'AVAILABLE')`, [tiny.data.station.id]);
    } catch (err) {
      triggerBlocked = err.constraint === 'chk_station_capacity';
    }
    check(triggerBlocked, 'the database trigger itself refuses to overfill a station');
    let inUseParked = false;
    try {
      await pool.query(`UPDATE bicycles SET status = 'IN_USE' WHERE station_id IS NOT NULL AND status = 'AVAILABLE' AND id = (SELECT id FROM bicycles WHERE status='AVAILABLE' LIMIT 1)`);
    } catch (err) {
      inUseParked = err.constraint === 'chk_bicycle_in_use_unparked';
    }
    check(inUseParked, 'the database refuses an IN_USE bicycle that is still parked');

    // ---- R. Maintenance ---------------------------------------------------
    console.log('\nScenario R — maintenance reporting');
    const lookup = await api('GET', `/api/bicycles/lookup?code=${encodeURIComponent(bike.cycle_code.toLowerCase())}`, { token: priya });
    check(lookup.status === 200 && lookup.data.bicycle.id === bike.id && lookup.data.bicycle.qr_code === undefined,
      'student can look a bicycle up by its printed code (no QR value returned)');
    const qrReport = await api('POST', '/api/maintenance', {
      token: priya,
      body: { bicycle_id: bike.id, category: 'QR_CODE', severity: 'LOW', description: 'QR label is scratched and will not scan.' },
    });
    check(qrReport.status === 201 && qrReport.data.report.category === 'QR_CODE', 'student reports a QR code issue');
    const frameReport = await api('POST', '/api/maintenance', {
      token: priya,
      body: { bicycle_id: raceBike.id, category: 'FRAME', severity: 'HIGH', description: 'Handlebar is bent.' },
    });
    check(frameReport.status === 201 && frameReport.data.safety_hold === true, 'a damaged-bicycle report places a safety hold');
    check(
      (await api('POST', '/api/maintenance', { token: priya, body: { bicycle_id: bike.id, category: 'NOPE', description: 'x' } })).status === 422,
      'unknown category -> 422'
    );
    const reportId = qrReport.data.report.id;
    const openList = (await api('GET', '/api/maintenance?status=OPEN', { token: admin })).data;
    check(openList.reports.some((r) => r.id === reportId), 'admin sees the report in the OPEN filter');
    check((await api('PATCH', `/api/maintenance/${reportId}/status`, { token: priya, body: { status: 'RESOLVED' } })).status === 403, 'a student cannot change report status');
    const prog = await api('PATCH', `/api/maintenance/${reportId}/status`, { token: admin, body: { status: 'IN_PROGRESS' } });
    check(prog.status === 200 && prog.data.report.status === 'IN_PROGRESS', 'admin moves the report to IN_PROGRESS');
    check(
      (await api('PATCH', `/api/maintenance/${reportId}/status`, { token: admin, body: { status: 'RESOLVED' } })).status === 422,
      'resolving without notes -> 422'
    );
    const resolved = await api('PATCH', `/api/maintenance/${reportId}/status`, {
      token: admin,
      body: { status: 'RESOLVED', resolution_notes: 'New QR label printed and attached.' },
    });
    check(resolved.status === 200 && resolved.data.report.resolution_notes && resolved.data.report.resolved_at, 'admin resolves it with notes');

    // ---- S. Admin workflow -------------------------------------------------
    console.log('\nScenario S — admin workflow');
    const ov = (await api('GET', '/api/admin/overview', { token: admin })).data;
    const dbc = (await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE role='STUDENT') students,
      (SELECT COUNT(*)::int FROM rentals WHERE status='COMPLETED') completed,
      (SELECT COUNT(*)::int FROM rentals WHERE status='ACTIVE') active,
      (SELECT COUNT(*)::int FROM maintenance_reports WHERE status IN ('OPEN','IN_PROGRESS')) pending,
      (SELECT COUNT(*)::int FROM bicycles WHERE status='IN_USE') in_use`)).rows[0];
    check(ov.students === dbc.students, `overview: registered students = ${dbc.students}`);
    check(ov.rides.completed === dbc.completed && ov.rides.active === dbc.active, 'overview: active and completed rides match the database');
    check(ov.pendingMaintenance === dbc.pending, 'overview: pending maintenance matches the database');
    check(ov.bicycles.IN_USE === dbc.in_use && ov.bicycles.FLEET === ov.bicycles.TOTAL - ov.bicycles.RETIRED, 'overview: fleet counts are consistent');

    const newBike = await api('POST', '/api/bicycles', {
      token: admin,
      body: { cycle_code: 'CC-99-1', qr_code: 'CC-QR-TEST991', station_id: st01.id, status: 'AVAILABLE', model: 'Test Model' },
    });
    check(newBike.status === 201 && newBike.data.bicycle.model === 'Test Model', 'admin adds a bicycle with a model');
    check(
      (await api('POST', '/api/bicycles', { token: admin, body: { cycle_code: 'CC-99-2', qr_code: 'CC-QR-TEST991', station_id: st01.id } })).status === 409,
      'duplicate QR value -> 409'
    );
    check(
      (await api('POST', '/api/bicycles', { token: admin, body: { cycle_code: 'CC-99-3', qr_code: 'CC-QR-TEST993', station_id: fullStation.id } })).status === 409,
      'assigning a new bicycle to a full station -> 409'
    );
    const edited = await api('PUT', `/api/bicycles/${newBike.data.bicycle.id}`, { token: admin, body: { model: 'Renamed Model', station_id: agira.id } });
    check(edited.status === 200 && edited.data.bicycle.model === 'Renamed Model' && edited.data.bicycle.station_id === agira.id, 'admin edits a bicycle and reassigns its station');
    const retired = await api('PATCH', `/api/bicycles/${newBike.data.bicycle.id}/status`, { token: admin, body: { status: 'RETIRED' } });
    check(retired.status === 200 && retired.data.bicycle.status === 'RETIRED' && retired.data.bicycle.station_id === null, 'retiring frees the dock');
    check(
      (await api('POST', '/api/rentals', { token: demo, body: { qr_code: 'CC-QR-TEST991' } })).status === 409,
      'a retired bicycle cannot be rented'
    );
    check(
      (await api('DELETE', `/api/bicycles/${bike.id}`, { token: admin })).status === 409,
      'a bicycle with ride history cannot be deleted (retire instead)'
    );
    const bikeHistory = (await api('GET', `/api/rentals?bicycle_id=${bike.id}`, { token: admin })).data;
    check(bikeHistory.rentals.some((r) => r.id === rideId), "admin sees a bicycle's rental history");

    const dupCode = await api('POST', '/api/stations', { token: admin, body: { code: 'ST01', name: 'Dup', location: 'x', capacity: 5 } });
    check(dupCode.status === 409, 'duplicate stop code -> 409');
    const moved = await api('PUT', `/api/stations/${st13.id}`, { token: admin, body: { map_x: 8.2, map_y: 89.5, location: 'Hostel D - Neeram Hall (moved)' } });
    check(moved.status === 200 && moved.data.station.map_x === 8.2 && moved.data.station.code === 'ST13', 'admin updates a station position without losing its code');
    check(
      (await api('PUT', `/api/stations/${tiny.data.station.id}`, { token: admin, body: { capacity: 0 } })).status === 422,
      'capacity 0 -> 422'
    );
    const shrink = await api('PUT', `/api/stations/${agira.id}`, { token: admin, body: { capacity: 1 } });
    check(shrink.status === 409, 'capacity below the bicycles parked -> 409');

    const search = (await api('GET', '/api/rentals?search=PRIYA.TEST', { token: admin })).data;
    check(search.rentals.length > 0 && search.rentals.every((r) => r.user_email === 'priya.test@campuscycle.edu'), 'admin ride search by student email');
    const actives = (await api('GET', '/api/rentals?status=ACTIVE', { token: admin })).data;
    check(actives.rentals.every((r) => r.status === 'ACTIVE'), 'admin filters active rides');
    check((await api('GET', '/api/rentals?search=%25', { token: admin })).data.rentals.length === 0, 'search treats % literally');

    const an = (await api('GET', '/api/analytics', { token: admin })).data;
    check(Array.isArray(an.charts.rentalsByWeek) && an.charts.rentalsByWeek.length >= 4, 'analytics: weekly rides series');
    check(Array.isArray(an.charts.maintenanceByWeek), 'analytics: maintenance trend series');
    const ridesInRange = an.charts.rentalsOverTime.reduce((s, d) => s + d.rides, 0);
    check(ridesInRange === an.period.rides_started, 'analytics: daily series sums to rides started');
    check(an.period.completion_rate_pct !== null && an.period.peak_hour !== null, 'analytics: completion rate and peak hour computed');

    // ---- T. Empty database -------------------------------------------------
    console.log('\nScenario T — empty database');
    await pool.query('TRUNCATE geofence_events, bicycle_location_pings, maintenance_reports, rentals, bicycles, stations, geofence_config, users RESTART IDENTITY CASCADE');
    const hash = await bcrypt.hash('Admin@123', 4);
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@campuscycle.edu', $1, 'ADMIN')`, [hash]);
    const admin2 = await login('admin@campuscycle.edu', 'Admin@123');
    const emptyMap = await api('GET', '/api/stations/map', { token: admin2 });
    check(emptyMap.status === 200 && emptyMap.data.stations.length === 0 && emptyMap.data.totals.available_bicycles === 0, 'empty DB: map returns no stations, no error');
    const emptyOv = await api('GET', '/api/admin/overview', { token: admin2 });
    check(emptyOv.status === 200 && emptyOv.data.bicycles.TOTAL === 0 && emptyOv.data.students === 0, 'empty DB: overview is all zeros');
    const emptyAn = await api('GET', '/api/analytics', { token: admin2 });
    check(emptyAn.status === 200 && emptyAn.data.period.rides_started === 0 && emptyAn.data.period.completion_rate_pct === null && emptyAn.data.period.peak_hour === null,
      'empty DB: analytics returns zeros and nulls, never NaN');
  } finally {
    server.close();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Test harness error:', err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
