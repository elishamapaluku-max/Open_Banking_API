const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const { profile, income } = require('../controllers/analyze.controller');

router.post('/profile', authenticateToken, profile);
router.post('/income', authenticateToken, income);

module.exports = router;
