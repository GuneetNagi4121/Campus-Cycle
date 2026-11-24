'use strict';

const config = require('../data/campus-map.json');
const stationModel = require('../models/stationModel');
const ApiError = require('../utils/ApiError');
const { toPositiveInt } = require('../utils/validators');

/**
 * Campus route planning on the illustrated campus map.
 *
 * The road network in data/campus-map.json was traced by hand over the roads
 * drawn on campus-map.png, in that image's pixel coordinates. A route between
 * two stations:
 *   1. snaps each station onto the nearest road segment (the "access" leg),
 *   2. finds the shortest path along the traced roads (Dijkstra),
 *   3. returns the polyline as percentages of the image so the frontend can
 *      draw it at any zoom level.
 *
 * Routes therefore follow the drawn roads and never cut straight through
 * buildings. Distances come from the path length in pixels times the map
 * scale documented in the config; the artwork is not survey-accurate, so they
 * are reported as approximate. No travel time is estimated.
 */

const { width: W, height: H } = config.image;
const METRES_PER_PX = config.scale.metres_per_pixel;

/** A station further than this from any road gets an explicit warning. */
const MAX_ACCESS_PX = 45;

// ---------------------------------------------------------------------------
// Graph construction (once, at module load).
// ---------------------------------------------------------------------------

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function buildGraph(cfg) {
  const nodes = new Map(); // id -> [x, y]
  const adj = new Map(); // id -> Map(neighbourId -> { w, road })
  const segments = []; // { a, b, road }

  for (const [id, xy] of Object.entries(cfg.junctions)) nodes.set(id, xy);

  const addEdge = (a, b, road) => {
    const w = dist(nodes.get(a), nodes.get(b));
    if (!adj.has(a)) adj.set(a, new Map());
    if (!adj.has(b)) adj.set(b, new Map());
    adj.get(a).set(b, { w, road });
    adj.get(b).set(a, { w, road });
    segments.push({ a, b, road });
  };

  cfg.roads.forEach((road, ri) => {
    const ids = road.points.map((p, pi) => {
      if (typeof p === 'string') {
        if (!nodes.has(p)) throw new Error(`campus-map.json: unknown junction "${p}" in ${road.name}`);
        return p;
      }
      const id = `r${ri}_${pi}`;
      nodes.set(id, p);
      return id;
    });
    for (let i = 1; i < ids.length; i += 1) addEdge(ids[i - 1], ids[i], road.name);
  });

  return { nodes, adj, segments };
}

const GRAPH = buildGraph(config);

/** Project point p onto segment a-b. Returns { point, t, d }. */
function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = [a[0] + t * dx, a[1] + t * dy];
  return { point, t, d: dist(p, point) };
}

/** Nearest point on the road network to pixel position p. */
function snapToRoad(p, graph = GRAPH) {
  let best = null;
  for (const seg of graph.segments) {
    const proj = projectOnSegment(p, graph.nodes.get(seg.a), graph.nodes.get(seg.b));
    if (!best || proj.d < best.d) best = { ...proj, seg };
  }
  return best;
}

/** Dijkstra over a small adjacency map. Returns the node id path or null. */
function shortestPath(adj, start, goal) {
  const distTo = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();

  while (true) {
    let u = null;
    let best = Infinity;
    for (const [id, d] of distTo) {
      if (!done.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) return null;
    if (u === goal) break;
    done.add(u);
    for (const [v, { w }] of adj.get(u) || []) {
      const nd = best + w;
      if (nd < (distTo.has(v) ? distTo.get(v) : Infinity)) {
        distTo.set(v, nd);
        prev.set(v, u);
      }
    }
  }

  const path = [goal];
  while (path[0] !== start) path.unshift(prev.get(path[0]));
  return path;
}

/**
 * Route between two pixel positions along the road network.
 * Pure function — exported for unit tests.
 */
function routeBetweenPoints(fromPx, toPx, graph = GRAPH) {
  const snapA = snapToRoad(fromPx, graph);
  const snapB = snapToRoad(toPx, graph);

  // Copy the adjacency so the two temporary "snap" nodes do not leak.
  const adj = new Map();
  for (const [k, m] of graph.adj) adj.set(k, new Map(m));
  const nodes = new Map(graph.nodes);

  const link = (id, point, seg) => {
    nodes.set(id, point);
    adj.set(id, new Map());
    for (const end of [seg.a, seg.b]) {
      const w = dist(point, nodes.get(end));
      adj.get(id).set(end, { w, road: seg.road });
      adj.get(end).set(id, { w, road: seg.road });
    }
  };
  link('__A', snapA.point, snapA.seg);
  link('__B', snapB.point, snapB.seg);

  // Both stations on the same road segment: allow the direct hop.
  if (snapA.seg === snapB.seg) {
    const w = dist(snapA.point, snapB.point);
    adj.get('__A').set('__B', { w, road: snapA.seg.road });
    adj.get('__B').set('__A', { w, road: snapA.seg.road });
  }

  const ids = shortestPath(adj, '__A', '__B');
  if (!ids) return null;

  const roadPoints = ids.map((id) => nodes.get(id));
  const roads = [];
  let roadPx = 0;
  for (let i = 1; i < ids.length; i += 1) {
    const edge = adj.get(ids[i - 1]).get(ids[i]);
    roadPx += edge.w;
    if (roads[roads.length - 1] !== edge.road) roads.push(edge.road);
  }

  const points = [fromPx, ...roadPoints, toPx];
  // Drop consecutive duplicates (a station sitting exactly on a junction).
  const polyline = points.filter(
    (p, i) => i === 0 || dist(p, points[i - 1]) > 0.01
  );
  const totalPx = roadPx + snapA.d + snapB.d;

  return {
    polyline,
    roads,
    roadPx,
    totalPx,
    accessPx: [snapA.d, snapB.d],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const toPercent = ([x, y]) => [
  Math.round((x / W) * 100 * 1000) / 1000,
  Math.round((y / H) * 100 * 1000) / 1000,
];
const toPixels = (mapX, mapY) => [(Number(mapX) / 100) * W, (Number(mapY) / 100) * H];

/** Round metres to a sensible precision for an approximate figure. */
function approxMetres(px) {
  const m = px * METRES_PER_PX;
  return m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
}

/** Static map description for the frontend (image + traced road network). */
function mapConfig() {
  return {
    image: config.image,
    coordinate_system:
      'map_x / map_y are percentages (0–100) of the image width / height, measured from the top-left corner. They are image positions, not GPS coordinates.',
    scale: config.scale,
    roads: config.roads.map((road) => ({
      name: road.name,
      points: road.points.map((p) =>
        toPercent(typeof p === 'string' ? config.junctions[p] : p)
      ),
    })),
  };
}

async function planRoute(fromRaw, toRaw) {
  const fromId = toPositiveInt(fromRaw);
  const toId = toPositiveInt(toRaw);
  const v = {};
  if (!fromId) v.from = 'Choose a start station';
  if (!toId) v.to = 'Choose a destination station';
  if (Object.keys(v).length) throw ApiError.unprocessable('Choose two stations', v);
  if (fromId === toId) {
    throw ApiError.unprocessable('Start and destination must be different stations', {
      to: 'Pick a different station',
    });
  }

  const [from, to] = await Promise.all([
    stationModel.findByIdWithCounts(fromId),
    stationModel.findByIdWithCounts(toId),
  ]);
  if (!from) throw ApiError.notFound('Start station not found');
  if (!to) throw ApiError.notFound('Destination station not found');
  for (const s of [from, to]) {
    if (!s.has_coordinates) {
      throw ApiError.unprocessable(`"${s.name}" has no position on the campus map yet`, {
        station: 'Not on the map',
      });
    }
  }

  const route = routeBetweenPoints(toPixels(from.map_x, from.map_y), toPixels(to.map_x, to.map_y));
  if (!route) {
    throw ApiError.unprocessable('No route along the mapped roads connects these stations');
  }

  const farFromRoad = route.accessPx.some((d) => d > MAX_ACCESS_PX);

  return {
    from: pickStation(from),
    to: pickStation(to),
    path: route.polyline.map(toPercent),
    roads: route.roads,
    distance: {
      approx_metres: approxMetres(route.totalPx),
      map_pixels: Math.round(route.totalPx),
      approximate: true,
      basis: config.scale.method,
    },
    warnings: farFromRoad
      ? ['One of these stations is placed away from the mapped roads; the first or last part of the route is a straight line.']
      : [],
  };
}

function pickStation(s) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    status: s.status,
    map_x: s.map_x,
    map_y: s.map_y,
    available_count: s.available_count,
    free_docks: s.free_docks,
    capacity: s.capacity,
    availability_level: s.availability_level,
  };
}

module.exports = {
  mapConfig,
  planRoute,
  // exported for tests
  routeBetweenPoints,
  snapToRoad,
  buildGraph,
  GRAPH,
  MAX_ACCESS_PX,
};
