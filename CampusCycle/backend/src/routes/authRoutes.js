'use strict';

const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const env = require('../config/env');

const router = express.Router();

// Brute-force protection for the credential endpoints. The automated test
// suites log in many times from one address, so they get a higher ceiling.
const isTest = env.nodeEnv === 'test';
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 20,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 1000 : 10,
  message: 'Too many accounts created from this address. Please try again later.',
});

router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);

module.exports = router;
