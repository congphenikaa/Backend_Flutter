import express from 'express';
import { skipSong, recordRecentlyPlayed, getRecentlyPlayed } from '../controllers/playerController.js';
import { protect } from '../middlewares/authMiddleware.js';

const playerRouter = express.Router();

playerRouter.post('/skip',              protect, skipSong);
playerRouter.post('/recently-played',  protect, recordRecentlyPlayed);
playerRouter.get('/recently-played',   protect, getRecentlyPlayed);

export default playerRouter;
