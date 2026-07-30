import express from 'express';
import {
	getModerationQueue,
	approveSong,
	rejectSong,
	getDashboardStats,
	getAllUsers,
	updateUserRole,
	toggleUserStatus
} from '../controllers/adminController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

// BẮT BUỘC: Mọi API ở đây chỉ Admin mới được dùng
router.use(protect, restrictTo('admin'));

// --- HÀNG ĐỢI KIỂM DUYỆT ---
// Lấy danh sách bài hát đang chờ duyệt
router.get('/moderation/queue', getModerationQueue);

// Quyết định của Admin (Duyệt hoặc Từ chối)
router.put('/moderation/:songId/approve', approveSong);
router.put('/moderation/:songId/reject', rejectSong);

// --- DASHBOARD ANALYTICS ---
router.get('/dashboard/stats', getDashboardStats);

// --- QUẢN LÝ NGƯỜI DÙNG ---
router.get('/users', getAllUsers);
router.put('/users/:id/role', updateUserRole);
router.put('/users/:id/status', toggleUserStatus);

export default router;