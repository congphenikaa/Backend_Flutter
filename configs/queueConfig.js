import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// Upstash dùng rediss:// (TLS) → ioredis cần bật tls để kết nối đúng
const isTLS = (process.env.REDIS_URL || '').startsWith('rediss://');

// Khởi tạo kết nối Redis dành riêng cho Queue (Tái sử dụng REDIS_URL hiện có)
const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Bắt buộc đối với BullMQ
    ...(isTLS ? { tls: {} } : {}),
});

connection.on('error', (err) => console.log(' [Queue Redis] Error:', err));
connection.on('ready', () => console.log(' [Queue Redis] Kết nối thành công!'));

// Tạo một cái Hàng đợi (Queue) có tên là 'play-count-queue'
export const playCountQueue = new Queue('play-count-queue', { connection });

export { connection };
