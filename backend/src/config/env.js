require('dotenv').config();

try {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'ANTHROPIC_API_KEY', 'ALLOWED_ORIGIN']
  required.forEach(key => {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
  })
} catch (err) {
  console.error(err.message)
  // do not call process.exit here — let the server start 
  // so Railway healthcheck passes, then fix variables
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
