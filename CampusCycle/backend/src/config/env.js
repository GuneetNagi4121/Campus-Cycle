'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const BACKEND_ENV = path.resolve(__dirname, '..', '..', '.env');
const NEON_ENV_LOCAL = path.resolve(__dirname, '..', '..', '..', '.env.local');

// DB_SOURCE chooses which database configuration wins:
//   auto  (default) — `neon deploy` / `neon env pull` write the Neon connection
//                     strings to CampusCycle/.env.local; it is loaded first so
//                     it takes precedence over backend/.env.
//   local           — ignore CampusCycle/.env.local and use backend/.env only
//                     (the local PostgreSQL on port 5432 during development).
// It may be set in the real environment or in backend/.env. Real environment
// variables (e.g. on Render) always win, as dotenv never overrides them.
function readDbSource() {
  if (process.env.DB_SOURCE) return process.env.DB_SOURCE;
  try {
    return dotenv.parse(fs.readFileSync(BACKEND_ENV)).DB_SOURCE || 'auto';
  } catch {
    return 'auto';
  }
}

const dbSource = readDbSource().trim().toLowerCase();
if (dbSource !== 'local') {
  dotenv.config({ path: NEON_ENV_LOCAL });
}
dotenv.config({ path: BACKEND_ENV });

/**
 * Centralised, validated environment configuration.
 * Fail fast at startup if something required is missing.
 */
function required(name, value) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Resolve the timezone used for day/hour bucketing in analytics. Both Node and
 * PostgreSQL are told the same zone so "today" means the same thing in each.
 * Defaults to the machine's zone, falling back to UTC.
 */
function resolveTimezone(name) {
  const candidate = name || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    console.warn(`Unknown APP_TIMEZONE "${candidate}", falling back to UTC`);
    return 'UTC';
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  dbSource,
  port: parseInt(process.env.PORT || '4000', 10),
  // Comma-separated list of allowed browser origins.
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5175')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Prefer a single DATABASE_URL; otherwise assemble from parts.
  databaseUrl: process.env.DATABASE_URL || null,
  // Direct (non-pooled) connection for schema migrations and seeding. Neon
  // provides it as DATABASE_URL_UNPOOLED; elsewhere it is the same database.
  databaseUrlUnpooled: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || null,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'campuscycle',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  jwtSecret: required('JWT_SECRET', process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),

  // Reporting timezone for analytics day/hour buckets (IANA name).
  appTimezone: resolveTimezone(process.env.APP_TIMEZONE),
};

// A short or placeholder signing secret makes every JWT forgeable.
if (env.jwtSecret.length < 32 || /change_me/i.test(env.jwtSecret)) {
  const msg = 'JWT_SECRET is weak — use at least 32 random characters (e.g. `openssl rand -hex 32`).';
  if (env.nodeEnv === 'production') throw new Error(msg);
  if (env.nodeEnv !== 'test') console.warn(`⚠ ${msg}`);
}

module.exports = env;
