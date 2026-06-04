const express = require('express');
const router = express.Router();
const { getBalance, getTransactions } = require('../controllers/accounts.controller');

router.get('/:id/balance', getBalance);
router.get('/:id/transactions', getTransactions);

module.exports = router;
