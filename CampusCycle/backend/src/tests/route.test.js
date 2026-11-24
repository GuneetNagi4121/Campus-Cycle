'use strict';

/**
 * Unit tests for the campus road network and route planner. No database.
 *
 * The station positions are read straight from database/seed-campus.sql, so
 * if someone moves a stop off the roads in the seed, this test says so.
 *
 * Usage:  npm run test:route   (from backend/)
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const {
  GRAPH,
  routeBetweenPoints,
  snapToRoad,
  mapConfig,
  MAX_ACCESS_PX,
} = require('../services/routeService');

let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  ✔', message);
  } else {
    failed += 1;
    console.error('  ✖', message);
  }
}

// --- seeded stops (code, px, py) -------------------------------------------
const seedSql = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'database', 'seed-campus.sql'),
  'utf8'
);
const STOPS = [...seedSql.matchAll(/\('(ST\d\d)',\s*'([^']+)',\s*'[^']*',\s*\d+,\s*(\d+),\s*(\d+),/g)].map(
  (m) => ({ code: m[1], name: m[2], p: [Number(m[3]), Number(m[4])] })
);

console.log('\nRoad network');
check(GRAPH.segments.length > 50, `network has ${GRAPH.segments.length} road segments`);

// Connectivity: breadth-first search from one junction reaches every node.
const seen = new Set(['TL']);
const queue = ['TL'];
while (queue.length) {
  const u = queue.shift();
  for (const v of GRAPH.adj.get(u).keys()) {
    if (!seen.has(v)) {
      seen.add(v);
      queue.push(v);
    }
  }
}
check(seen.size === GRAPH.nodes.size, `every road node is connected (${seen.size}/${GRAPH.nodes.size})`);

const inImage = [...GRAPH.nodes.values()].every(
  ([x, y]) => x >= 0 && x <= 1280 && y >= 0 && y <= 720
);
check(inImage, 'all road points lie inside the 1280 x 720 map image');

const cfg = mapConfig();
check(
  cfg.roads.every((r) => r.points.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100)),
  'mapConfig() exposes the roads as 0–100 percentages'
);

console.log('\nStation placement');
check(STOPS.length === 19, `seed defines 19 stops (found ${STOPS.length})`);
const offRoad = STOPS.filter((s) => snapToRoad(s.p).d > 6);
check(
  offRoad.length === 0,
  offRoad.length === 0
    ? 'every stop sits on a mapped road (within 6 px)'
    : `stops placed away from roads: ${offRoad.map((s) => s.code).join(', ')}`
);
const codes = new Set(STOPS.map((s) => s.code));
check(codes.size === STOPS.length, 'stop codes are unique');

console.log('\nRoutes');
let allRouted = true;
let allFollowRoads = true;
let allLongerThanCrowFlies = true;
for (const a of STOPS) {
  for (const b of STOPS) {
    if (a === b) continue;
    const r = routeBetweenPoints(a.p, b.p);
    if (!r) {
      allRouted = false;
      continue;
    }
    if (r.accessPx.some((d) => d > MAX_ACCESS_PX)) allFollowRoads = false;
    const crow = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
    if (r.totalPx + 1e-6 < crow) allLongerThanCrowFlies = false;
  }
}
check(allRouted, 'a route exists between every pair of the 19 stops (342 routes)');
check(allFollowRoads, 'no route needs an off-road access leg');
check(allLongerThanCrowFlies, 'no route is shorter than the straight line (sanity)');

const byCode = Object.fromEntries(STOPS.map((s) => [s.code, s]));
const neeramToEntrance = routeBetweenPoints(byCode.ST13.p, byCode.ST01.p);
check(
  neeramToEntrance.roads.length === 1 && neeramToEntrance.roads[0] === 'Bottom road',
  'Neeram Hall -> Main Entrance runs straight along the bottom road'
);

const trackToCricket = routeBetweenPoints(byCode.ST08.p, byCode.ST09.p);
const crow = Math.hypot(byCode.ST08.p[0] - byCode.ST09.p[0], byCode.ST08.p[1] - byCode.ST09.p[1]);
check(
  trackToCricket.totalPx > crow * 2,
  'Student Track -> Cricket Ground goes round by road, not across the field'
);
check(
  trackToCricket.polyline.length > 4,
  `route polyline has multiple road vertices (${trackToCricket.polyline.length})`
);

const library = byCode.ST04;
const academic = byCode.ST06;
const libToAcad = routeBetweenPoints(library.p, academic.p);
check(
  Math.abs(libToAcad.totalPx - (academic.p[0] - library.p[0])) < 1,
  'two stops on the same straight road are routed directly between them'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
