import express from "express";
import { getUserDetail , toggleLikeSong ,toggleFollowArtist, 
    getLikedSongs, updateUserProfile, searchUsers, changePassword } from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";
import upload from '../configs/cloudinaryConfig.js';

const router = express.Router();

router.get("/detail/:id", getUserDetail);

router.post("/toggle-like", protect, toggleLikeSong);
router.post("/toggle-follow", protect, toggleFollowArtist);
router.get("/liked-songs", protect, getLikedSongs);
router.put("/update", protect, upload.single('image'), updateUserProfile);

// Tìm kiếm user (dùng cho chat) — yêu cầu đăng nhập
router.get("/search", protect, searchUsers);

router.put("/change-password", protect, changePassword);

export default router;