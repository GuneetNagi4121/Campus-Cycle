'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    // Only the configured frontend origin(s) may call the API from a browser.
    // Requests without an Origin header (curl, server-to-server) are allowed;
    // they are still subject to JWT authentication.
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));

if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// All API routes live under /api.
app.use('/api', apiRoutes);

// 404 + centralised error handling (must be last).
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
