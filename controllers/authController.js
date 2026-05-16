import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Tao token 
const generateToken = (id) => {
    return jwt.sign({id}, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};


// 1. Dang ky
export const registerUser = async (req, res) => {
    try {
        const { username, email, password, gender } = req.body;

        // kiem tra xem email da ton tai chua
        const userExists = await User.findOne({email});

        if(userExists) {
            return res.status(400).json({success:false, message: "Email này đã tồn tại"});
        }

        // ma hoa password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // tao user moi (mac dinh la user)
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            gender,
            role: 'user',
            authProvider: 'local',        
            googleId: null                
        });

        await newUser.save();

        // tra ve ket qua (khong tra ve password)
        res.status(201).json({
            success: true,
            messsage: "Đăng ký thành công",
            user: {
                _id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                token: generateToken(newUser._id) // gui kem token de login
            }
        });


    } catch (error) {
        res.status(500).json({success: false, message: "Lỗi server", error: error.message});
    }
};

//2. Dang nhap
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // === QUAN TRỌNG: Phải select password ===
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "Email không tồn tại" 
            });
        }

        // Kiểm tra xem user có password không
        if (!user.password) {
            return res.status(400).json({ 
                success: false, 
                message: "Tài khoản này được tạo bằng Google. Vui lòng đăng nhập bằng Google." 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: "Mật khẩu không đúng" 
            });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: "Đăng nhập thành công",
            token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server" 
        });
    }
};

// ===================== GOOGLE LOGIN =====================s
export const googleLogin = async (req, res) => {
    try {
        const { idToken, accessToken } = req.body;

        let payload;

        if (idToken) {
            // Trường hợp Flutter gửi idToken
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } 
        else if (accessToken) {
            // Trường hợp Web gửi accessToken
            const response = await axios.get(
                `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`
            );
            payload = response.data; // chứa email, name, picture...
        } 
        else {
            return res.status(400).json({ success: false, message: "Thiếu idToken hoặc accessToken" });
        }

        const { email, name, picture, sub: googleId } = payload;

        if (!email) {
            return res.status(400).json({ success: false, message: "Không lấy được email từ Google" });
        }

        // Tìm hoặc tạo user
        let user = await User.findOne({ email });

        if (!user) {
            user = await User.create({
                username: name || email.split("@")[0],
                email,
                googleId,
                authProvider: "google",
                avatar: picture || "",
                role: "user",
            });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: "Đăng nhập Google thành công",
            token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
            },
        });
    } catch (error) {
        console.error("Google Login Error:", error);
        res.status(400).json({ success: false, message: "Google authentication failed" });
    }
};
