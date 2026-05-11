import express from 'express';
import { addSong, listSong, removeSong, updateSong, listSongByCategory, 
    listSongByAlbum , searchGlobal, incrementPlays} from '../controllers/songController.js';
import { uploadSongFiles } from '../middlewares/uploadMiddleware.js';

const songRouter = express.Router();

songRouter.post('/add', uploadSongFiles, addSong);
songRouter.post('/remove', removeSong);
songRouter.get('/list', listSong);
songRouter.post('/update', uploadSongFiles, updateSong);
songRouter.get('/category/:id', listSongByCategory);

songRouter.get('/album/:id', listSongByAlbum);

songRouter.get('/search', searchGlobal);

songRouter.post('/play', incrementPlays);
export default songRouter;