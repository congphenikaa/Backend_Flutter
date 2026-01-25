import express from "express";
import { getUserDetail , toggleLikeSong ,toggleFollowArtist, 
    getLikedSongs, updateUserProfile } from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";
import upload from '../configs/cloudinaryConfig.js';

const router = express.Router();

router.get("/detail/:id", getUserDetail);

router.post("/toggle-like", protect, toggleLikeSong);
router.post("/toggle-follow", protect, toggleFollowArtist);
router.get("/liked-songs", protect, getLikedSongs);
router.put("/update", protect, upload.single('image'), updateUserProfile);

export default router;