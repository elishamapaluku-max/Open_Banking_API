import express from 'express';
const router = express.Router();
import { getBalance, getTransactions } from '../controllers/accounts.controller.js';

router.get('/:id/balance', getBalance);
router.get('/:id/transactions', getTransactions);

export default router;
