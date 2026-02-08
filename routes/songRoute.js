import express from 'express';
import { addSong, listSong, removeSong, updateSong, listSongByCategory, 
    listSongByAlbum , searchGlobal, incrementPlays} from '../controllers/songController.js';
import upload from '../configs/cloudinaryConfig.js';

const songRouter = express.Router();

const uploadMiddleware = (req, res, next) => {
    // Cấu hình nhận 2 field: image và audio
    const uploadFields = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]);

    uploadFields(req, res, (err) => {
        if (err) {
            // Nếu file sai định dạng hoặc quá lớn, Multer sẽ báo lỗi ở đây
            return res.json({ success: false, message: err.message }); 
        }
        // Nếu ổn thì đi tiếp vào Controller addSong
        next();
    });
};

songRouter.post('/add', uploadMiddleware, addSong);
songRouter.post('/remove', removeSong);
songRouter.get('/list', listSong);
songRouter.post('/update', uploadMiddleware, updateSong);
songRouter.get('/category/:id', listSongByCategory);

songRouter.get('/album/:id', listSongByAlbum);

songRouter.get('/search', searchGlobal);

songRouter.post('/play', incrementPlays);
export default songRouter;