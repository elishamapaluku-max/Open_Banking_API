import 'dotenv/config';

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

export const PORT = process.env.PORT;
export const DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET = process.env.JWT_SECRET;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
export const NODE_ENV = process.env.NODE_ENV || 'development';
