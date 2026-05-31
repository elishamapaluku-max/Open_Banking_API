import { NODE_ENV } from '../config/env.js';

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error stack in development
  if (NODE_ENV === 'development') {
    console.error('Error:', err.stack);
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    code: statusCode
  });
};

export default errorHandler;
