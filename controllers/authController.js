import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
            role: 'user'
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

        const {email, password} = req.body;
        
        // Tim user theo email
        const user = await User.findOne({email});
        if(!user) {
            return res.status(400).json({success:false, message: "Email không tồn tại"});
        }

        // so sanh password voi password ma hoa
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) {
            return res.status(400).json({success:false, message: "Mật khẩu không đúng"})
        }

        const token = generateToken(user._id);

        // Dang nhap thanh cong -> tra ve token va thong tin
        res.status(200).json({
            success: true,
            message: "Đăng nhập thành công",
            token: token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
            }
        })

    }catch(error) {
        res.status(500).json({success: false, message: "Lỗi server", error: error.message});
    }
};
