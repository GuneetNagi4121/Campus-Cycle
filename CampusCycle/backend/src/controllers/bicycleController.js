'use strict';

const asyncHandler = require('../utils/asyncHandler');
const bicycleService = require('../services/bicycleService');
const { toPositiveInt } = require('../utils/validators');
const ApiError = require('../utils/ApiError');
const { BICYCLE_STATUS_VALUES, ROLES } = require('../utils/constants');

function idParam(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw ApiError.badRequest('Invalid bicycle id');
  return id;
}

/**
 * The QR value is what unlocks a cycle, so students never receive it from the
 * API — they must scan (or type) the label on the physical bicycle. Admins see
 * it so they can print labels.
 */
function forViewer(req, bike) {
  if (!bike || req.user.role === ROLES.ADMIN) return bike;
  const { qr_code: _hidden, ...rest } = bike;
  return rest;
}

const list = asyncHandler(async (req, res) => {
  const { status, station_id: stationId, search } = req.query;
  if (status && !BICYCLE_STATUS_VALUES.includes(status)) {
    throw ApiError.badRequest('Invalid status filter');
  }
  const bicycles = await bicycleService.list({
    status,
    stationId: stationId ? toPositiveInt(stationId) : undefined,
    search: search ? String(search).slice(0, 80) : undefined,
  });
  res.json({ bicycles: bicycles.map((b) => forViewer(req, b)) });
});

/**
 * GET /api/bicycles/lookup?code= — find one bicycle by its QR value or its
 * printed cycle code (used when reporting a problem with a scanned cycle).
 */
const lookup = asyncHandler(async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  if (!code) throw ApiError.unprocessable('Enter a cycle or QR code', { code: 'Required' });
  const bike = await bicycleService.findByCode(code.slice(0, 80));
  if (!bike) throw ApiError.notFound('No bicycle matches that code');
  res.json({ bicycle: forViewer(req, bike) });
});

const stats = asyncHandler(async (req, res) => {
  res.json({ stats: await bicycleService.stats() });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ bicycle: forViewer(req, await bicycleService.getById(idParam(req))) });
});

const create = asyncHandler(async (req, res) => {
  const bicycle = await bicycleService.create(req.body);
  res.status(201).json({ bicycle });
});

const update = asyncHandler(async (req, res) => {
  const bicycle = await bicycleService.update(idParam(req), req.body);
  res.json({ bicycle });
});

const changeStatus = asyncHandler(async (req, res) => {
  const bicycle = await bicycleService.changeStatus(idParam(req), req.body.status, req.body.station_id);
  res.json({ bicycle });
});

const remove = asyncHandler(async (req, res) => {
  res.json(await bicycleService.remove(idParam(req)));
});

module.exports = { list, lookup, stats, getOne, create, update, changeStatus, remove };
