'use strict';

const {
  AVAILABILITY_LEVEL,
  LOW_AVAILABILITY_PERCENT,
  LOW_AVAILABILITY_COUNT,
  STATION_STATUS,
} = require('./constants');

/**
 * THE station availability rule for the whole application.
 *
 * Every surface that shows availability — the station list, the station
 * detail page, the campus map, the student dashboard — derives it from here,
 * so the numbers can never disagree between screens.
 *
 *   available_count    bicycles with status AVAILABLE parked at the station
 *   bikes_at_station   every bicycle occupying a dock (any status)
 *   free_docks         capacity - bikes_at_station (room to return a cycle)
 *   capacity           docking capacity of the station
 *   availability_pct   round(available / capacity * 100), 0 when capacity is 0
 *   availability_level INACTIVE | NONE | FULL | LOW | GOOD
 *
 * Precedence: an inactive station is INACTIVE; a station with nothing to pick
 * up is NONE; a station with cycles but no free dock is FULL; otherwise LOW or
 * GOOD by how many cycles are left.
 */
function availabilityPercent(available, capacity) {
  const cap = Number(capacity) || 0;
  if (cap <= 0) return 0; // no capacity recorded -> avoid dividing by zero
  const avail = Number(available) || 0;
  return Math.min(100, Math.round((avail / cap) * 100));
}

function availabilityLevel({ status, available, capacity, parked }) {
  if (status !== STATION_STATUS.ACTIVE) return AVAILABILITY_LEVEL.INACTIVE;
  const avail = Number(available) || 0;
  if (avail <= 0) return AVAILABILITY_LEVEL.NONE;
  const cap = Number(capacity) || 0;
  if (parked !== undefined && cap > 0 && Number(parked) >= cap) return AVAILABILITY_LEVEL.FULL;
  const low =
    avail <= LOW_AVAILABILITY_COUNT ||
    availabilityPercent(avail, capacity) < LOW_AVAILABILITY_PERCENT;
  return low ? AVAILABILITY_LEVEL.LOW : AVAILABILITY_LEVEL.GOOD;
}

function numOrNull(v) {
  return v === null || v === undefined ? null : Number(v);
}

/**
 * Decorate a station row from the database with the derived availability
 * fields and numeric map position. Returns a new object; never mutates input.
 *
 * map_x / map_y are the station's position on the illustrated campus map, as
 * a percentage (0–100) of the image width / height. They are image positions,
 * not geographic coordinates.
 */
function decorateStation(row) {
  if (!row) return row;
  const capacity = Number(row.capacity) || 0;
  const available = Number(row.available_count) || 0;
  const parked = Number(row.bikes_at_station) || 0;
  const mapX = numOrNull(row.map_x);
  const mapY = numOrNull(row.map_y);

  return {
    ...row,
    capacity,
    available_count: available,
    bikes_at_station: parked,
    free_docks: Math.max(0, capacity - parked),
    map_x: mapX,
    map_y: mapY,
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    // "On the map" means it has a position on the campus map image.
    has_coordinates: mapX !== null && mapY !== null,
    accepts_returns: row.status === STATION_STATUS.ACTIVE && parked < capacity,
    availability_pct: availabilityPercent(available, capacity),
    availability_level: availabilityLevel({
      status: row.status,
      available,
      capacity,
      parked,
    }),
  };
}

module.exports = { availabilityPercent, availabilityLevel, decorateStation };
