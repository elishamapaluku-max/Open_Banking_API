import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

/**
 * Authenticate JWT token from Authorization header
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token is required',
      code: 401
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token',
        code: 403
      });
    }

    req.user = decoded;
    next();
  });
};

/**
 * Optional authentication - proceeds even if no token is present
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(); // Proceed without authentication on invalid token
    }

    req.user = decoded;
    next();
  });
};

export {
  authenticateToken,
  optionalAuth
};
