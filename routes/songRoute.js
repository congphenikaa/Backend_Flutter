import express from 'express';
import { 
    addSong, listSong, removeSong, updateSong, 
    listSongByCategory, listSongByAlbum, searchGlobal, incrementPlays
} from '../controllers/songController.js';
import { uploadSongFiles } from '../middlewares/uploadMiddleware.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js'; 

const songRouter = express.Router();

// --- PUBLIC ROUTES (Cho người dùng nghe nhạc) ---
songRouter.get('/list', listSong);
songRouter.get('/category/:id', listSongByCategory);
songRouter.get('/album/:id', listSongByAlbum);
songRouter.get('/search', searchGlobal);
songRouter.post('/play', incrementPlays);

// --- ADMIN ROUTES (Upload thủ công, quản lý kho nhạc) ---
songRouter.use(protect, restrictTo('admin')); // Mọi route bên dưới dòng này đều yêu cầu quyền Admin

songRouter.post('/add', uploadSongFiles, addSong);
songRouter.post('/update', uploadSongFiles, updateSong);
songRouter.post('/remove', removeSong);

export default songRouter;