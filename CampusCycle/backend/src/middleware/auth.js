'use strict';

const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const { pool } = require('../config/db');

/**
 * Authentication middleware.
 * Reads a Bearer token, verifies it, and attaches `req.user = { id, role }`.
 *
 * The role is re-read from the database rather than trusted from the token,
 * so a deleted account or a changed role takes effect immediately instead of
 * when the token expires.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }

  try {
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.id]);
    if (!rows[0]) return next(ApiError.unauthorized('This account no longer exists'));
    req.user = { id: rows[0].id, role: rows[0].role };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Role-based authorization middleware factory.
 * Must run after `authenticate`.
 *
 *   router.post('/', authenticate, authorize('ADMIN'), handler)
 *
 * @param {...string} allowedRoles
 */
function authorize(...allowedRoles) {
  return function authorizeRole(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('This action requires one of the roles: ' + allowedRoles.join(', ')));
    }
    return next();
  };
}

module.exports = { authenticate, authorize };
