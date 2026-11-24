'use strict';

/**
 * Safety net for the DESTRUCTIVE scripts (db:migrate rebuilds every table,
 * db:seed truncates them). They refuse to run against a database that
 * already holds users unless the caller passes --yes-reset explicitly.
 */
async function assertSafeToReset(pool, scriptName) {
  if (process.argv.includes('--yes-reset')) return;
  let users = 0;
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    users = rows[0].n;
  } catch {
    return; // no users table yet — nothing to lose
  }
  if (users > 0) {
    const err = new Error(
      `${scriptName} would ERASE ${users} existing user(s) and all related data.\n` +
        '  For a non-destructive update use:  npm run db:update\n' +
        `  To reset anyway:                   npm run ${scriptName} -- --yes-reset`
    );
    err.isGuard = true;
    throw err;
  }
}

module.exports = { assertSafeToReset };
