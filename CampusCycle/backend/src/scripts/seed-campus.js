'use strict';

/**
 * Loads database/seed-campus.sql — the 19 campus-map stops, the demonstration
 * fleet, demo accounts and sample rides. Non-destructive and idempotent.
 *
 * Usage:  npm run db:seed:campus   (from backend/)
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { createPool } = require('../config/db');

const pool = createPool(env.databaseUrlUnpooled);
const SEED_PATH = path.join(__dirname, '..', '..', '..', 'database', 'seed-campus.sql');

async function run() {
  const result = await pool.query(fs.readFileSync(SEED_PATH, 'utf8'));
  const summary = Array.isArray(result) ? result[result.length - 1] : result;
  if (summary && summary.rows && summary.rows[0]) {
    console.log('  ', JSON.stringify(summary.rows[0]));
  }
  console.log('✔ Campus seed applied from', path.relative(process.cwd(), SEED_PATH));
}

run()
  .catch((err) => {
    console.error('✖ Campus seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
