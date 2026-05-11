import express from 'express';
import { submitRequest, getAllRequests, approveRequest, rejectRequest } from '../controllers/artistRequestController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/submit', protect, restrictTo('user'), submitRequest);
router.get('/all', protect, restrictTo('admin'), getAllRequests);
router.put('/approve/:id', protect, restrictTo('admin'), approveRequest);
router.put('/reject/:id', protect, restrictTo('admin'), rejectRequest);

export default router;
