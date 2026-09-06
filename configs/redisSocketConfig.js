import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// Redis client riêng cho Socket.IO — dùng ioredis (bắt buộc với @socket.io/redis-adapter)
// KHÔNG tái sử dụng redisConfig.js (đang dùng redis v4 native cho các controller cũ)
// Pub/Sub cần 2 client riêng biệt: một client pub, một client sub

// Upstash dùng rediss:// (TLS) → ioredis cần bật tls để kết nối đúng
const isTLS = (process.env.REDIS_URL || '').startsWith('rediss://');

const createRedisClient = () =>
    new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(isTLS ? { tls: {} } : {}),
    });

export { createRedisClient };
