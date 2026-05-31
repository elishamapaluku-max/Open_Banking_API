import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { ALLOWED_ORIGIN, NODE_ENV } from './config/env.js';
import errorHandler from './middleware/error.middleware.js';

const app = express();

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

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/v1', routes);

// Global error handling middleware
app.use(errorHandler);

export default app;
