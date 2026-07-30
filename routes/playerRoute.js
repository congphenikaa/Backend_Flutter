import express from 'express';
import { skipSong } from '../controllers/playerController.js';
import { protect } from '../middlewares/authMiddleware.js';

const playerRouter = express.Router();

playerRouter.post('/skip', protect, skipSong);

export default playerRouter;
