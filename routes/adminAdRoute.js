import express from 'express';
import { getAds, createAd, updateAd, deleteAd, getAdStats } from '../controllers/adminAdController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';
import upload from '../configs/cloudinaryConfig.js';

const router = express.Router();

router.use(protect, restrictTo('admin'));

router.get('/', getAds);
router.get('/stats', getAdStats);

// Upload multipart/form-data
router.post('/', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]), createAd);

router.put('/:id', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]), updateAd);

router.delete('/:id', deleteAd);

export default router;
