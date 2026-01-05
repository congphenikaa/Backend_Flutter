import express from 'express';
import { 
    createPlaylist, 
    getUserPlaylists, 
    addSongToPlaylist, 
    removePlaylist,
    getPlaylistById,
} from '../controllers/playlistController.js';
import upload from '../configs/cloudinaryConfig.js';

const playlistRouter = express.Router();

playlistRouter.post('/create', upload.single('image'), createPlaylist);
playlistRouter.post('/user-list', getUserPlaylists);
playlistRouter.post('/add-song', addSongToPlaylist);
playlistRouter.post('/remove', removePlaylist);
playlistRouter.get('/detail/:id', getPlaylistById);


export default playlistRouter;