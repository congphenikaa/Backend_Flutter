import express from 'express';
import {
    createMoMoPayment,
    momoIPN,
    paymentSuccess,
    getUserTransactions,
    checkAndExpirePremium,
} from '../controllers/paymentController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public — MoMo gọi lại
router.post('/create-momo', createMoMoPayment);
router.get('/success', paymentSuccess);
router.post('/momo-ipn', momoIPN);

// Authenticated — Flutter user gọi
router.get('/transactions', protect, getUserTransactions);
router.post('/check-expire', protect, checkAndExpirePremium);

export default router;