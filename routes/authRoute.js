import express from "express";
import {registerUser, loginUser, googleLogin, requestPasswordReset, verifyOTPAndResetPassword, verifyOTP} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleLogin);
router.post('/forgot-password', requestPasswordReset);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', verifyOTPAndResetPassword);

export default router;