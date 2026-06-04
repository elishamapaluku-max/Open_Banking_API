const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parseStatement } = require('../controllers/parse.controller');

// Configure multer for memory storage with 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

router.post('/statement', upload.single('statement'), parseStatement);

module.exports = router;
