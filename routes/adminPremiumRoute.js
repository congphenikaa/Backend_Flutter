import express from 'express';
import {
    getAdminPremiumPlans,
    createPremiumPlan,
    updatePremiumPlan,
    deletePremiumPlan,
    getAdminCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    getAdminPremiumUsers,
    grantPremium,
    revokePremium,
    getAdminTransactions,
    getTransactionStats,
} from '../controllers/premiumCatalogController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect, restrictTo('admin'));

router.get('/plans', getAdminPremiumPlans);
router.post('/plans', createPremiumPlan);
router.put('/plans/:id', updatePremiumPlan);
router.delete('/plans/:id', deletePremiumPlan);

router.get('/coupons', getAdminCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

// Quản lý tài khoản Premium
router.get('/users', getAdminPremiumUsers);
router.post('/users/:id/grant', grantPremium);
router.delete('/users/:id/revoke', revokePremium);

// Lịch sử giao dịch
router.get('/transactions/stats', getTransactionStats);
router.get('/transactions', getAdminTransactions);

export default router;