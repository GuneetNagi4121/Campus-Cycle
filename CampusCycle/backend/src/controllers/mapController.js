'use strict';

const asyncHandler = require('../utils/asyncHandler');
const routeService = require('../services/routeService');

/** GET /api/map — the campus map image, its scale and the traced road network. */
const config = asyncHandler(async (req, res) => {
  res.json({ map: routeService.mapConfig() });
});

/** GET /api/map/route?from=<stationId>&to=<stationId> — a route along the roads. */
const route = asyncHandler(async (req, res) => {
  res.json({ route: await routeService.planRoute(req.query.from, req.query.to) });
});

module.exports = { config, route };
