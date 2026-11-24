'use strict';

const bicycleModel = require('../models/bicycleModel');
const stationModel = require('../models/stationModel');
const rentalModel = require('../models/rentalModel');
const maintenanceModel = require('../models/maintenanceModel');
const geofenceModel = require('../models/geofenceModel');
const { pool } = require('../config/db');
const { STATION_STATUS } = require('../utils/constants');

async function peopleAndRides(db = pool) {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'STUDENT')        AS students,
      (SELECT COUNT(*)::int FROM rentals WHERE status = 'COMPLETED')  AS completed_rides,
      (SELECT COUNT(*)::int FROM rentals)                             AS total_rides`);
  return rows[0];
}

/**
 * Aggregate figures for the admin dashboard "Campus Overview".
 * Phase 2 adds maintenance and geofence counts; the Phase 1 keys are
 * unchanged so the existing dashboard keeps working.
 */
async function overview() {
  const [bicycles, stations, activeRentals, recentRentals, maintenance, geofence, people] =
    await Promise.all([
      bicycleModel.countByStatus(),
      stationModel.listWithCounts(),
      rentalModel.countActive(),
      rentalModel.listAll({ limit: 8 }),
      maintenanceModel.countByStatus(),
      geofenceModel.countEventsByStatus(),
      peopleAndRides(),
    ]);

  return {
    bicycles, // { AVAILABLE, RESERVED, IN_USE, MAINTENANCE, RETIRED, TOTAL, FLEET }
    stations: {
      total: stations.length,
      active: stations.filter((s) => s.status === STATION_STATUS.ACTIVE).length,
      mapped: stations.filter((s) => s.has_coordinates).length,
      full: stations.filter((s) => s.availability_level === 'FULL').length,
      empty: stations.filter((s) => s.availability_level === 'NONE').length,
      capacity: stations.reduce((sum, s) => sum + s.capacity, 0),
    },
    students: people.students,
    rides: {
      active: activeRentals,
      completed: people.completed_rides,
      total: people.total_rides,
    },
    pendingMaintenance: maintenance.OPEN + maintenance.IN_PROGRESS,
    activeRentals,
    recentRentals,
    maintenance, // { OPEN, IN_PROGRESS, RESOLVED, CLOSED, TOTAL }
    geofence, // { OPEN, ACKNOWLEDGED, RESOLVED, TOTAL }
  };
}

module.exports = { overview };
