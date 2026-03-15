import express from 'express';
import chartController from '../controllers/chartController.js'; 

const router = express.Router();

// Khai báo các endpoint
router.get('/trending', chartController.getTrendingTop);
export default router;
