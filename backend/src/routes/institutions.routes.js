import express from 'express';
const router = express.Router();
import { getInstitutions } from '../controllers/institutions.controller.js';

router.get('/', getInstitutions);

export default router;
