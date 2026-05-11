import express from 'express';
import {
	getModerationQueue,
	approveSong,
	rejectSong,
	getDashboardStats,
	addCategory,
	getAllCategories
} from '../controllers/adminController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';
import { upload } from '../configs/cloudinaryConfig.js';

const router = express.Router();

// BẮT BUỘC: Mọi API ở đây chỉ Admin mới được dùng
router.use(protect, restrictTo('admin'));

// --- HÀNG ĐỢI KIỂM DUYỆT ---
// Lấy danh sách
router.get('/moderation/queue', getModerationQueue);

// Quyết định của Admin
router.put('/moderation/:songId/approve', approveSong);
router.put('/moderation/:songId/reject', rejectSong);

// --- DASHBOARD ANALYTICS ---
router.get('/dashboard/stats', getDashboardStats);

// --- QUẢN LÝ THỂ LOẠI (CATEGORY) ---
router.get('/categories', getAllCategories);
// Dùng upload.single('image') để lưu trực tiếp ảnh category lên Cloudinary
router.post('/categories/add', upload.single('image'), addCategory);

export default router;
