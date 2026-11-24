'use strict';

/**
 * Test database selection + safety guard. Require this FIRST in every suite.
 *
 * The end-to-end suites rebuild the schema and reload seed data, which ERASES
 * the target database. They therefore run only against a database whose name
 * ends in "_test":
 *
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/campuscycle_test
 *
 * TEST_DATABASE_URL (or TEST_DB_NAME, which reuses the DB_* host/user/password
 * with a different database name) is applied before the app reads its config.
 */
process.env.NODE_ENV = 'test';
process.env.DB_SOURCE = process.env.DB_SOURCE || 'local';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
} else {
  // Load backend/.env now so DB_* are known, then drop the URL so the pool is
  // built from DB_* parts pointing at the test database.
  require('../config/env');
  process.env.DB_NAME = process.env.TEST_DB_NAME || `${process.env.DB_NAME || 'campuscycle'}_test`;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  // env.js was already evaluated; patch its view of the connection settings.
  const env = require('../config/env');
  env.databaseUrl = null;
  env.databaseUrlUnpooled = null;
  env.db.name = process.env.DB_NAME;
}

async function assertTestDatabase(pool) {
  const { rows } = await pool.query('SELECT current_database() AS name');
  const name = rows[0].name;
  if (!/_test$/.test(name)) {
    console.error(
      `✖ Refusing to run: the e2e suite erases its database, and "${name}" does not end in "_test".\n` +
        '  Create one (createdb campuscycle_test) or set TEST_DATABASE_URL.'
    );
    process.exit(1);
  }
  console.log(`Using test database "${name}"`);
}

module.exports = { assertTestDatabase };
