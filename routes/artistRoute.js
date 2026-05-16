import express from 'express';
import { 
    addArtist, listArtist, removeArtist, updateArtist, getArtistDetail, 
    uploadSong, getMySongs, createAlbum, addSongToAlbum, getMyAlbums, getDashboardStats 
} from '../controllers/artistController.js';
import upload from '../configs/cloudinaryConfig.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';
import { uploadSongFiles } from '../middlewares/uploadMiddleware.js';

const artistRouter = express.Router();

// --- PUBLIC ROUTES ---
// Mọi người có thể xem danh sách và chi tiết nghệ sĩ
artistRouter.get('/list', listArtist);
artistRouter.get('/detail/:id', getArtistDetail);


// --- ADMIN ROUTES (Quản lý hồ sơ nghệ sĩ) ---
// Admin quản lý các account/profile của nghệ sĩ
artistRouter.post('/add', protect, restrictTo('admin'), upload.single('image'), addArtist);
artistRouter.post('/remove', protect, restrictTo('admin'), removeArtist);
artistRouter.post('/update', protect, restrictTo('admin'), upload.single('image'), updateArtist);


// --- ARTIST ROUTES (Creator Studio) ---
// Mọi route bên dưới đều yêu cầu quyền Artist
artistRouter.use(protect, restrictTo('artist'));

// Quản lý bài hát của nghệ sĩ
artistRouter.post('/songs/upload', uploadSongFiles, uploadSong);
artistRouter.get('/my-songs', getMySongs);

// Quản lý album của nghệ sĩ
artistRouter.post('/albums/create', upload.single('image'), createAlbum);
artistRouter.put('/albums/add-song', addSongToAlbum);
artistRouter.get('/albums', getMyAlbums);

// Thống kê dành cho nghệ sĩ
artistRouter.get('/dashboard/stats', getDashboardStats);

export default artistRouter;