import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Tao token 
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};


// 1. Dang ky
export const registerUser = async (req, res) => {
    try {
        const { username, email, password, gender } = req.body;

        // kiem tra xem email da ton tai chua
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ success: false, message: "Email này đã tồn tại" });
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
        res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
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

        if (user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin"
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

        if (user && user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin"
            });
        }

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

// ===================== QUÊN MẬT KHẨU (GỬI OTP) =====================
export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "Email không tồn tại trong hệ thống." });
        }

        // Tạo mã OTP 6 số ngẫu nhiên
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Lưu OTP vào DB và hết hạn sau 10 phút
        user.resetOTP = otp;
        user.resetOTPExpiry = Date.now() + 10 * 60 * 1000;
        await user.save();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Yêu cầu khôi phục mật khẩu - Ứng dụng Nghe Nhạc',
            text: `Mã xác nhận (OTP) để khôi phục mật khẩu của bạn là: ${otp}\n\nMã này sẽ hết hạn sau 10 phút.\nNếu bạn không yêu cầu, vui lòng bỏ qua email này.`
        };

        // Bọc trong try-catch riêng để nếu lỗi gửi mail thì vẫn báo cho frontend biết
        try {
            await transporter.sendMail(mailOptions);
            res.status(200).json({ success: true, message: "Mã xác nhận đã được gửi đến email của bạn." });
        } catch (mailError) {
            console.error("Lỗi gửi email:", mailError);
            res.status(500).json({ success: false, message: "Không thể gửi email lúc này. Vui lòng thử lại sau." });
        }

    } catch (error) {
        console.error("Lỗi requestPasswordReset:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===================== KIỂM TRA OTP =====================
export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "Email không tồn tại." });
        }

        if (!user.resetOTP || !user.resetOTPExpiry) {
            return res.status(400).json({ success: false, message: "Bạn chưa yêu cầu khôi phục mật khẩu. Vui lòng khởi động lại server Node.js nếu bạn vừa cập nhật code." });
        }

        if (user.resetOTP !== otp) {
            return res.status(400).json({ success: false, message: "Mã xác nhận không đúng." });
        }

        if (user.resetOTPExpiry < Date.now()) {
            return res.status(400).json({ success: false, message: "Mã xác nhận đã hết hạn." });
        }

        // Tạo mã token chứng nhận đã qua bước OTP thành công
        const resetToken = jwt.sign(
            { email: user.email, purpose: 'password_reset' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' } // Token chỉ sống trong 5 phút
        );

        // Xóa OTP cũ trong DB để không bị dùng lại
        user.resetOTP = undefined;
        user.resetOTPExpiry = undefined;
        await user.save();

        res.status(200).json({ 
            success: true, 
            message: "Xác thực thành công", 
            resetToken 
        });
    } catch (error) {
        console.error("Lỗi verifyOTP:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===================== ĐẶT LẠI MẬT KHẨU BẰNG OTP =====================
export const verifyOTPAndResetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;

        if (!resetToken) {
            return res.status(400).json({ success: false, message: "Thiếu mã xác thực quyền đổi mật khẩu." });
        }

        // Giải mã mã token kiểm tra tính hợp lệ
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        
        if (decoded.purpose !== 'password_reset') {
            return res.status(400).json({ success: false, message: "Mã xác thực không hợp lệ." });
        }

        // Tìm đúng user dựa trên email ẩn trong token
        const user = await User.findOne({ email: decoded.email }).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: "Người dùng không tồn tại." });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "Mật khẩu phải từ 6 ký tự trở lên." });
        }

        // Mã hóa mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Cập nhật mật khẩu
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ success: true, message: "Mật khẩu đã được thay đổi thành công." });

    } catch (error) {
        console.log("===> LỖI THỰC TẾ TẠI BƯỚC 3 LÀ:", error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: "Phiên làm việc đã hết hạn (Quá 15 phút). Vui lòng lấy lại OTP." });
        }
        console.error("Lỗi verifyOTPAndResetPassword:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};
