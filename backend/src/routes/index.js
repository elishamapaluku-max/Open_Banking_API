import express from 'express';
const router = express.Router();

import authRouter from './auth.routes.js';
import accountsRouter from './accounts.routes.js';
import analyzeRouter from './analyze.routes.js';
import parseRouter from './parse.routes.js';
import institutionsRouter from './institutions.routes.js';

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to KipaAPI' });
});

router.use('/auth', authRouter);
router.use('/accounts', accountsRouter);
router.use('/analyze', analyzeRouter);
router.use('/parse', parseRouter);
router.use('/institutions', institutionsRouter);

export default router;
