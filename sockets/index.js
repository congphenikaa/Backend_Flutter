import { Server }              from 'socket.io';
import { createAdapter }       from '@socket.io/redis-adapter';
import { createRedisClient }   from '../configs/redisSocketConfig.js';
import { socketAuthMiddleware } from './socketAuthMiddleware.js';
import { registerChatHandlers } from './chatHandler.js';

let io = null;

/**
 * Khởi tạo Socket.IO gắn vào httpServer
 * Phải gọi SAU khi đã tạo httpServer = createServer(app)
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export const initSocket = (httpServer) => {
    // Tạo 2 client riêng biệt cho Redis Pub/Sub Adapter
    // (Socket.IO Adapter yêu cầu pub và sub là 2 client độc lập)
    const pubClient = createRedisClient();
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('[Socket Redis Pub] Error:', err.message));
    subClient.on('error', (err) => console.error('[Socket Redis Sub] Error:', err.message));

    io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        // ★ Tăng timeout để tránh disconnect giả trên mạng di động chậm
        pingTimeout:  60000, // 60s
        pingInterval: 25000, // 25s
    });

    // Gắn Redis Adapter — sẵn sàng scale nhiều instance
    io.adapter(createAdapter(pubClient, subClient));

    // Áp dụng JWT auth middleware cho toàn bộ connections
    io.use(socketAuthMiddleware);

    // Đăng ký tất cả chat event handlers
    registerChatHandlers(io);

    console.log('[Socket.IO] Khởi tạo thành công với Redis Adapter');
    return io;
};

/**
 * Lấy io instance sau khi đã khởi tạo
 * Dùng khi cần emit từ HTTP route controller
 *
 * @returns {import('socket.io').Server}
 */
export const getIO = () => {
    if (!io) throw new Error('[Socket.IO] Chưa được khởi tạo! Gọi initSocket(httpServer) trước.');
    return io;
};
