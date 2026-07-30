import jwt from 'jsonwebtoken';

/**
 * Middleware xác thực JWT cho Socket.IO
 * Tái sử dụng cùng JWT_SECRET với authMiddleware.js của HTTP routes
 *
 * Client phải truyền token qua handshake:
 *   socket = IO.io(url, IO.OptionBuilder().setAuth({'token': accessToken}).build())
 */
export const socketAuthMiddleware = (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error('UNAUTHORIZED: Không có token'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id; // Gắn userId vào socket để dùng trong handlers
        next();
    } catch {
        next(new Error('INVALID_TOKEN: Token không hợp lệ hoặc đã hết hạn'));
    }
};
