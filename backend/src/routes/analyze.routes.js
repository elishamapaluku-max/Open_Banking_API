import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.middleware.js';
import { profile, income } from '../controllers/analyze.controller.js';

router.post('/profile', authenticateToken, profile);
router.post('/income', authenticateToken, income);

export default router;
