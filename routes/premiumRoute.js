import express from 'express';
import { getPublicPremiumPlans, validateCoupon } from '../controllers/premiumCatalogController.js';

const router = express.Router();

router.get('/plans', getPublicPremiumPlans);
router.post('/coupons/validate', validateCoupon);

export default router;