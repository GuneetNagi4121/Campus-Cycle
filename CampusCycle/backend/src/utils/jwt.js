'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Sign a JWT for an authenticated user.
 * @param {{ id: number, role: string }} payload
 * @returns {string}
 */
function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' });
}

/**
 * Verify and decode a JWT. Throws if invalid/expired.
 * @param {string} token
 * @returns {object}
 */
function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

module.exports = { signToken, verifyToken };
