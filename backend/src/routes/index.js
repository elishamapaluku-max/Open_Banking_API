const express = require('express');
const router = express.Router();

const authRouter = require('./auth.routes');
const accountsRouter = require('./accounts.routes');
const analyzeRouter = require('./analyze.routes');
const parseRouter = require('./parse.routes');
const institutionsRouter = require('./institutions.routes');

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to KipaAPI' });
});

router.use('/auth', authRouter);
router.use('/accounts', accountsRouter);
router.use('/analyze', analyzeRouter);
router.use('/parse', parseRouter);
router.use('/institutions', institutionsRouter);

module.exports = router;
