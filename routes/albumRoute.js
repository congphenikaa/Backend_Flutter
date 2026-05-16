import express from 'express';
import { addAlbum, listAlbums, removeAlbum, updateAlbum } from '../controllers/albumController.js';
import upload from '../configs/cloudinaryConfig.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const albumRouter = express.Router();

// --- PUBLIC ROUTES ---
albumRouter.get('/list', listAlbums);

// --- ADMIN ROUTES (Quản lý album hệ thống/playlist) ---
albumRouter.use(protect, restrictTo('admin'));

albumRouter.post('/add', upload.single('image'), addAlbum);
albumRouter.post('/update', upload.single('image'), updateAlbum);
albumRouter.post('/remove', removeAlbum);

export default albumRouter;