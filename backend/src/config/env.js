require('dotenv').config();

const requiredEnvVars = [
  'PORT',
  'DATABASE_URL',
  'JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'ALLOWED_ORIGIN'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  );
}

const PORT = process.env.PORT;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const NODE_ENV = process.env.NODE_ENV || 'development';

module.exports = {
  PORT,
  DATABASE_URL,
  JWT_SECRET,
  ANTHROPIC_API_KEY,
  ALLOWED_ORIGIN,
  NODE_ENV
};
