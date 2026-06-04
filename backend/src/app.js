const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { ALLOWED_ORIGIN, NODE_ENV } = require('./config/env');
const errorHandler = require('./middleware/error.middleware');

const app = express();

// Health check route - must be first for Railway healthcheck
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: ALLOWED_ORIGIN,
  credentials: true
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logging in development mode
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// API routes
app.use('/api/v1', routes);

// Global error handling middleware
app.use(errorHandler);

module.exports = app;
