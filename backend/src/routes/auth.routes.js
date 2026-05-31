const express = require('express');
const router = express.Router();
const { connect, callback, revoke } = require('../controllers/auth.controller');

router.post('/connect', connect);
router.get('/callback', callback);
router.post('/revoke', revoke);

module.exports = router;
