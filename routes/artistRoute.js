import express from 'express';
import { addArtist, listArtist, removeArtist, updateArtist, getArtistDetail, uploadSong, getMySongs, createAlbum, addSongToAlbum, getMyAlbums, getDashboardStats } from '../controllers/artistController.js';
import upload from '../configs/cloudinaryConfig.js';
import { upload as uploadDirect } from '../configs/cloudinaryConfig.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';
import { uploadSongFiles } from '../middlewares/uploadMiddleware.js';

const artistRouter = express.Router();

// Route thêm artist: Dùng upload.single vì chỉ có 1 ảnh
artistRouter.post('/add', upload.single('image'), addArtist);

// Route liệt kê
artistRouter.get('/list', listArtist);

// Route xóa
artistRouter.post('/remove', removeArtist);

// Route sửa
artistRouter.post('/update', upload.single('image'), updateArtist);

// Route lấy chi tiết nghệ sĩ
artistRouter.get('/detail/:id', getArtistDetail);

// Creator studio routes
artistRouter.post('/songs/upload', protect, restrictTo('artist'), uploadSongFiles, uploadSong);
artistRouter.get('/my-songs', protect, restrictTo('artist'), getMySongs);

// Album routes
artistRouter.post('/albums/create', protect, restrictTo('artist'), uploadDirect.single('image'), createAlbum);
artistRouter.put('/albums/add-song', protect, restrictTo('artist'), addSongToAlbum);
// Lấy danh sách Album của Artist
artistRouter.get('/albums', protect, restrictTo('artist'), getMyAlbums);
// Lấy dữ liệu thống kê Dashboard
artistRouter.get('/dashboard/stats', protect, restrictTo('artist'), getDashboardStats);

export default artistRouter;