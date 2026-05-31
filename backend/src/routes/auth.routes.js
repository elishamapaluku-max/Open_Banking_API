import express from 'express';
const router = express.Router();
import { connect, callback, revoke } from '../controllers/auth.controller.js';

router.post('/connect', connect);
router.get('/callback', callback);
router.post('/revoke', revoke);

export default router;
