'use strict';

const { withTransaction, pool } = require('../config/db');
const bicycleModel = require('../models/bicycleModel');
const stationModel = require('../models/stationModel');
const rentalModel = require('../models/rentalModel');
const maintenanceModel = require('../models/maintenanceModel');
const ApiError = require('../utils/ApiError');
const { BICYCLE_STATUS, BICYCLE_STATUS_VALUES } = require('../utils/constants');
const { isNonEmptyString, toPositiveInt, FieldErrors } = require('../utils/validators');

/** Statuses for which a bicycle is physically parked at a station. */
const PARKED_STATUSES = [BICYCLE_STATUS.AVAILABLE, BICYCLE_STATUS.RESERVED];

/** Statuses that mean "rentable", and therefore require no safety hold. */
const SERVICEABLE_STATUSES = [BICYCLE_STATUS.AVAILABLE, BICYCLE_STATUS.RESERVED];

/** Statuses in which a bicycle is never at a station. */
const UNPARKED_STATUSES = [BICYCLE_STATUS.IN_USE, BICYCLE_STATUS.RETIRED];

async function assertStationHasRoom(stationId, excludeBicycleId = null, db = pool) {
  const station = await stationModel.findById(stationId, db);
  if (!station) {
    throw ApiError.unprocessable('Selected station does not exist', { stationId: 'Unknown station' });
  }
  const bikesAtStation = await bicycleModel.list({ stationId }, db);
  const currentCount = excludeBicycleId
    ? bikesAtStation.filter((b) => b.id !== excludeBicycleId).length
    : bikesAtStation.length;
  if (currentCount >= station.capacity) {
    throw ApiError.conflict(
      `Station "${station.name}" is full (${station.capacity}/${station.capacity})`,
      { stationId: 'Station at capacity' }
    );
  }
  return station;
}

/**
 * A bicycle with an unresolved HIGH/CRITICAL maintenance report is on SAFETY
 * HOLD and must not be returned to service by any route. Called inside the
 * transaction that changes the status, with the bicycle row already locked.
 */
async function assertNoSafetyHold(bicycleId, targetStatus, db) {
  if (!SERVICEABLE_STATUSES.includes(targetStatus)) return;
  const holds = await maintenanceModel.findSafetyHolds(bicycleId, db);
  if (holds.length > 0) {
    throw ApiError.conflict(
      `This bicycle has ${holds.length} unresolved safety issue(s) and cannot be returned to service. Resolve the maintenance report(s) first.`,
      { status: 'Blocked by an open safety issue' }
    );
  }
}

/**
 * Normalise and validate create/update input.
 * @returns {{cycleCode:string, qrCode:string, stationId:number|null, status:string}}
 */
function normalizeInput(body) {
  const v = new FieldErrors();
  const cycleCode = typeof body.cycle_code === 'string' ? body.cycle_code.trim() : body.cycle_code;
  const qrCode = typeof body.qr_code === 'string' ? body.qr_code.trim() : body.qr_code;
  const status = body.status || BICYCLE_STATUS.AVAILABLE;
  const model =
    body.model === undefined || body.model === null || String(body.model).trim() === ''
      ? null
      : String(body.model).trim();
  const stationId =
    body.station_id === null || body.station_id === undefined || body.station_id === ''
      ? null
      : toPositiveInt(body.station_id);

  v.check(isNonEmptyString(cycleCode), 'cycle_code', 'Cycle code is required');
  v.check(isNonEmptyString(qrCode), 'qr_code', 'QR code is required');
  v.check(typeof cycleCode !== 'string' || cycleCode.length <= 40, 'cycle_code', 'Cycle code is too long (max 40)');
  v.check(typeof qrCode !== 'string' || qrCode.length <= 80, 'qr_code', 'QR code is too long (max 80)');
  v.check(model === null || model.length <= 80, 'model', 'Model is too long (max 80)');
  v.check(BICYCLE_STATUS_VALUES.includes(status), 'status', 'Invalid bicycle status');
  if (body.station_id !== null && body.station_id !== undefined && body.station_id !== '') {
    v.check(stationId !== null, 'station_id', 'Station id must be a positive integer');
  }
  // A parked bike (available/reserved) must live at a station.
  if (PARKED_STATUSES.includes(status)) {
    v.check(stationId !== null, 'station_id', 'A station is required for available/reserved bicycles');
  }
  v.throwIfAny();

  return { cycleCode, qrCode, stationId, status, model };
}

/**
 * List bicycles, annotated with their safety-hold state so the UI can explain
 * why an otherwise-available bicycle is out of service.
 */
async function list(filters) {
  const [bicycles, heldIds] = await Promise.all([
    bicycleModel.list(filters),
    maintenanceModel.bicycleIdsOnSafetyHold(),
  ]);
  const held = new Set(heldIds);
  return bicycles.map((b) => ({ ...b, on_safety_hold: held.has(b.id) }));
}

async function getById(id) {
  const bike = await bicycleModel.findById(id);
  if (!bike) throw ApiError.notFound('Bicycle not found');
  const holds = await maintenanceModel.findSafetyHolds(id);
  return {
    ...bike,
    on_safety_hold: holds.length > 0,
    open_safety_issues: holds.length,
  };
}

async function findByCode(code) {
  const bike = await bicycleModel.findByCode(code);
  if (!bike) return null;
  const holds = await maintenanceModel.findSafetyHolds(bike.id);
  return { ...bike, on_safety_hold: holds.length > 0 };
}

async function create(body) {
  const { cycleCode, qrCode, stationId, status, model } = normalizeInput(body);

  if (await bicycleModel.existsCycleCode(cycleCode)) {
    throw ApiError.conflict('A bicycle with this cycle code already exists', { cycle_code: 'Already in use' });
  }
  if (await bicycleModel.existsQrCode(qrCode)) {
    throw ApiError.conflict('A bicycle with this QR code already exists', { qr_code: 'Already in use' });
  }

  if (status === BICYCLE_STATUS.IN_USE) {
    throw ApiError.unprocessable('A new bicycle cannot start out IN_USE', {
      status: 'A bicycle only becomes IN_USE through a rental',
    });
  }

  // Retired bikes are not at a station; ignore any provided station.
  const effectiveStationId = UNPARKED_STATUSES.includes(status) ? null : stationId;
  if (effectiveStationId !== null) {
    await assertStationHasRoom(effectiveStationId);
  }

  return bicycleModel.create({ cycleCode, qrCode, stationId: effectiveStationId, status, model });
}

async function update(id, body) {
  return withTransaction(async (client) => {
    const locked = await bicycleModel.findByIdForUpdate(id, client);
    if (!locked) throw ApiError.notFound('Bicycle not found');

    const existing = await bicycleModel.findById(id, client);

    if (await rentalModel.hasActiveRentalForBicycle(id, client)) {
      throw ApiError.conflict('This bicycle is on an active ride and cannot be edited until it is returned');
    }

    // Merge with existing so callers may send partial updates.
    const merged = normalizeInput({
      cycle_code: body.cycle_code !== undefined ? body.cycle_code : existing.cycle_code,
      qr_code: body.qr_code !== undefined ? body.qr_code : existing.qr_code,
      station_id: body.station_id !== undefined ? body.station_id : existing.station_id,
      status: body.status !== undefined ? body.status : existing.status,
      model: body.model !== undefined ? body.model : existing.model,
    });

    if (merged.status === BICYCLE_STATUS.IN_USE && existing.status !== BICYCLE_STATUS.IN_USE) {
      throw ApiError.conflict('A bicycle can only become IN_USE through a rental');
    }

    if (await bicycleModel.existsCycleCode(merged.cycleCode, id, client)) {
      throw ApiError.conflict('A bicycle with this cycle code already exists', { cycle_code: 'Already in use' });
    }
    if (await bicycleModel.existsQrCode(merged.qrCode, id, client)) {
      throw ApiError.conflict('A bicycle with this QR code already exists', { qr_code: 'Already in use' });
    }

    if (merged.status !== existing.status) {
      await assertNoSafetyHold(id, merged.status, client);
    }

    const effectiveStationId = UNPARKED_STATUSES.includes(merged.status) ? null : merged.stationId;
    if (effectiveStationId !== null && effectiveStationId !== existing.station_id) {
      await assertStationHasRoom(effectiveStationId, id, client);
    }

    return bicycleModel.update(
      id,
      {
        cycleCode: merged.cycleCode,
        qrCode: merged.qrCode,
        stationId: effectiveStationId,
        status: merged.status,
        model: merged.model,
      },
      client
    );
  });
}

/**
 * Change only the status of a bicycle (admin). Optionally reassign a station.
 *
 * Runs in a transaction with the bicycle row locked, so it cannot interleave
 * with a rental starting, a rental being returned, or a maintenance report
 * being filed. Blocked while the bicycle is on an active ride (use the return
 * flow instead) and blocked from returning a bicycle to service while it has
 * an unresolved safety issue.
 */
async function changeStatus(id, status, stationIdRaw) {
  if (!BICYCLE_STATUS_VALUES.includes(status)) {
    throw ApiError.unprocessable('Invalid bicycle status', { status: 'Unknown status' });
  }

  return withTransaction(async (client) => {
    const locked = await bicycleModel.findByIdForUpdate(id, client);
    if (!locked) throw ApiError.notFound('Bicycle not found');

    const existing = await bicycleModel.findById(id, client);

    if (await rentalModel.hasActiveRentalForBicycle(id, client)) {
      throw ApiError.conflict('This bicycle is on an active ride; end the ride before changing its status');
    }

    let stationId =
      stationIdRaw === undefined ? existing.station_id : toPositiveInt(stationIdRaw);
    if (stationIdRaw === null || stationIdRaw === '') stationId = null;

    if (status === BICYCLE_STATUS.IN_USE) {
      // Cannot be manually moved to IN_USE without a rental.
      throw ApiError.conflict('A bicycle can only become IN_USE through a rental');
    }

    await assertNoSafetyHold(id, status, client);

    // Retiring withdraws the cycle from the fleet and frees its dock.
    if (status === BICYCLE_STATUS.RETIRED) stationId = null;

    if (PARKED_STATUSES.includes(status) && stationId === null) {
      throw ApiError.unprocessable('A station is required to make this bicycle available', {
        station_id: 'Station required',
      });
    }
    if (stationId !== null && stationId !== existing.station_id) {
      await assertStationHasRoom(stationId, id, client);
    }

    return bicycleModel.setStatusAndStation(id, status, stationId, client);
  });
}

async function remove(id) {
  const existing = await bicycleModel.findById(id);
  if (!existing) throw ApiError.notFound('Bicycle not found');
  if (await rentalModel.hasActiveRentalForBicycle(id)) {
    throw ApiError.conflict('This bicycle is on an active ride and cannot be deleted');
  }
  if (Number(existing.total_rides) > 0) {
    throw ApiError.conflict(
      'This bicycle has ride history, so it cannot be deleted. Retire it instead to keep the records.'
    );
  }
  await bicycleModel.remove(id);
  return { id: Number(id), deleted: true };
}

async function stats() {
  return bicycleModel.countByStatus();
}

module.exports = { list, getById, findByCode, create, update, changeStatus, remove, stats };
