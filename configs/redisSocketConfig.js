import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// Redis client riêng cho Socket.IO — dùng ioredis (bắt buộc với @socket.io/redis-adapter)
// KHÔNG tái sử dụng redisConfig.js (đang dùng redis v4 native cho các controller cũ)
// Pub/Sub cần 2 client riêng biệt: một client pub, một client sub
const createRedisClient = () =>
    new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

export { createRedisClient };
