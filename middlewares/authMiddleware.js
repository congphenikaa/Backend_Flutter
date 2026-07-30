import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// 1. xac thuc nguoi dung kiem tra token
export const protect = async (req, res, next) => {
    let token;

    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {

            // lay token tu header (dang: "Bearer abcdxyz")
            token = req.headers.authorization.split(' ')[1];

            // gia ma token lay id user
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Tim user trong db va gan vao req.user (de dung o cac buoc sau)
            req.user = await User.findById(decoded.id).select('-password');

            // Kiểm tra xem user có tồn tại và không bị khóa không
            if (!req.user) {
                return res.status(401).json({ message: 'Người dùng không tồn tại' });
            }
            if (req.user.isActive === false) {
                return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin' });
            }

            next(); // cho phep di tiep

        }catch (error) {
            res.status(401).json({message: 'Token khong hop le, khong duoc phep truy cap'});
        }
    }
}

export const adminOnly = (req, res, next) => {
    if( req.user && req.user.role === 'admin') {
        next();
    }else {
        res.status(403).json({message: 'Truy cập bị từ chối! chỉ dành cho admin'});
    }
}

export const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Truy cập bị từ chối! Bạn không có quyền thực hiện hành động này."
            });
        }
        next();
    };
};