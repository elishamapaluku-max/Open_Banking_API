import express from 'express';
const router = express.Router();
import multer from 'multer';
import { parseStatement } from '../controllers/parse.controller.js';

// Configure multer for memory storage with 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

router.post('/statement', upload.single('statement'), parseStatement);

export default router;
