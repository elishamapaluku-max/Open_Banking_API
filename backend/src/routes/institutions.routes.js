const express = require('express');
const router = express.Router();
const { getInstitutions } = require('../controllers/institutions.controller');

router.get('/', getInstitutions);

module.exports = router;
