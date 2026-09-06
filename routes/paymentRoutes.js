import express from 'express';
import {
    createMoMoPayment,
    momoIPN,
    paymentSuccess,
    getUserTransactions,
    checkAndExpirePremium,
    cancelPendingTransaction,
    adminResolveTransaction,
} from '../controllers/paymentController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public — MoMo gọi lại
router.post('/create-momo', createMoMoPayment);
router.get('/success', paymentSuccess);
router.post('/momo-ipn', momoIPN);

// Authenticated — Flutter user gọi
router.get('/transactions', protect, getUserTransactions);
router.post('/check-expire', protect, checkAndExpirePremium);

// Admin only — xử lý giao dịch treo
router.patch('/admin/transactions/:transactionId/cancel',  protect, restrictTo('admin'), cancelPendingTransaction);
router.post('/admin/transactions/:transactionId/resolve',  protect, restrictTo('admin'), adminResolveTransaction);

export default router;