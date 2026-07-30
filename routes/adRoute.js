import express from 'express';
import { getNextAd, recordAdPlayed, recordAdClick, grantAdFreeReward, checkAdFreeStatus } from '../controllers/adController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect); // Yêu cầu đăng nhập

router.get('/next', getNextAd);
router.get('/ad-free-status', checkAdFreeStatus);
router.post('/:id/played', recordAdPlayed);
router.post('/:id/click', recordAdClick);
router.post('/reward', grantAdFreeReward);

export default router;
