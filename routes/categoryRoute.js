import express from 'express';
import { addCategory, listCategory, removeCategory, updateCategory } from '../controllers/categoryController.js';
import upload from '../configs/cloudinaryConfig.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const categoryRouter = express.Router();

// --- PUBLIC ROUTES ---
categoryRouter.get('/list', listCategory);

// --- ADMIN ROUTES (Chỉ admin mới được tạo/sửa/xóa Thể loại) ---
categoryRouter.use(protect, restrictTo('admin'));

categoryRouter.post('/add', upload.single('image'), addCategory);
categoryRouter.post('/update', upload.single('image'), updateCategory);
categoryRouter.post('/remove', removeCategory);

export default categoryRouter;