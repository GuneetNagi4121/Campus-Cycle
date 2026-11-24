'use strict';

const { pool } = require('../config/db');
const { decorateStation } = require('../utils/availability');

/**
 * Data access for the `stations` table.
 *
 * Read queries return the derived availability fields (availability_pct,
 * availability_level) via decorateStation(), so every caller — list, detail
 * and the campus map — sees exactly the same numbers.
 */

const STATION_COLUMNS = `
  s.id, s.code, s.name, s.location, s.capacity, s.status,
  s.map_x, s.map_y, s.latitude, s.longitude,
  s.created_at, s.updated_at`;

const COUNT_COLUMNS = `
  COUNT(b.id) FILTER (WHERE b.status = 'AVAILABLE')::int AS available_count,
  COUNT(b.id)::int AS bikes_at_station`;

async function listWithCounts(db = pool) {
  const { rows } = await db.query(
    `SELECT ${STATION_COLUMNS}, ${COUNT_COLUMNS}
     FROM stations s
     LEFT JOIN bicycles b ON b.station_id = s.id
     GROUP BY s.id
     ORDER BY s.code NULLS LAST, s.name`
  );
  return rows.map(decorateStation);
}

async function findById(id, db = pool) {
  const { rows } = await db.query(
    `SELECT id, code, name, location, capacity, status, map_x, map_y,
            latitude, longitude, created_at, updated_at
     FROM stations WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findByIdWithCounts(id, db = pool) {
  const { rows } = await db.query(
    `SELECT ${STATION_COLUMNS}, ${COUNT_COLUMNS}
     FROM stations s
     LEFT JOIN bicycles b ON b.station_id = s.id
     WHERE s.id = $1
     GROUP BY s.id`,
    [id]
  );
  return rows[0] ? decorateStation(rows[0]) : null;
}

async function create(
  { code, name, location, capacity, status, mapX, mapY, latitude, longitude },
  db = pool
) {
  const { rows } = await db.query(
    `INSERT INTO stations (code, name, location, capacity, status, map_x, map_y, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      code ?? null,
      name,
      location,
      capacity,
      status,
      mapX ?? null,
      mapY ?? null,
      latitude ?? null,
      longitude ?? null,
    ]
  );
  return findByIdWithCounts(rows[0].id, db);
}

async function update(
  id,
  { code, name, location, capacity, status, mapX, mapY, latitude, longitude },
  db = pool
) {
  const { rowCount } = await db.query(
    `UPDATE stations
     SET code = $2, name = $3, location = $4, capacity = $5, status = $6,
         map_x = $7, map_y = $8, latitude = $9, longitude = $10
     WHERE id = $1`,
    [
      id,
      code ?? null,
      name,
      location,
      capacity,
      status,
      mapX ?? null,
      mapY ?? null,
      latitude ?? null,
      longitude ?? null,
    ]
  );
  if (rowCount === 0) return null;
  return findByIdWithCounts(id, db);
}

/** Lock a station row (serialises returns/assignments to that station). */
async function findByIdForUpdate(id, db) {
  const { rows } = await db.query(
    'SELECT id, name, capacity, status FROM stations WHERE id = $1 FOR UPDATE',
    [id]
  );
  return rows[0] || null;
}

async function existsCode(code, exceptId = null, db = pool) {
  const params = [code];
  let sql = 'SELECT 1 FROM stations WHERE code = $1';
  if (exceptId) {
    params.push(exceptId);
    sql += ' AND id <> $2';
  }
  const { rows } = await db.query(sql, params);
  return rows.length > 0;
}

/** Number of bicycles physically assigned to this station. */
async function countBicycles(id, db = pool) {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM bicycles WHERE station_id = $1',
    [id]
  );
  return rows[0].count;
}

/** Number of ACTIVE rentals that reference this station as start or end. */
async function countActiveRentalsReferencing(id, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM rentals
     WHERE status = 'ACTIVE' AND (start_station_id = $1 OR end_station_id = $1)`,
    [id]
  );
  return rows[0].count;
}

async function remove(id, db = pool) {
  const { rowCount } = await db.query('DELETE FROM stations WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  listWithCounts,
  findById,
  findByIdWithCounts,
  findByIdForUpdate,
  existsCode,
  create,
  update,
  countBicycles,
  countActiveRentalsReferencing,
  remove,
};
