'use strict';

const express = require('express');
const mapController = require('../controllers/mapController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', mapController.config);
router.get('/route', mapController.route);

module.exports = router;
