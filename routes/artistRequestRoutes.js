import express from 'express';
import {
    createRequest,
    getMyRequest,
    getAllRequests,
    approveRequest,
    rejectRequest,
    cancelRequest
} from '../controllers/artistRequestController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

// User routes
router.post('/', protect, createRequest);
router.get('/my-request', protect, getMyRequest);
router.delete('/:id', protect, cancelRequest);

// Admin routes
router.get('/', protect, restrictTo('admin'), getAllRequests);
router.patch('/:id/approve', protect, restrictTo('admin'), approveRequest);
router.patch('/:id/reject', protect, restrictTo('admin'), rejectRequest);

export default router;