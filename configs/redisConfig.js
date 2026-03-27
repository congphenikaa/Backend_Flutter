import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Khởi tạo client kết nối với Redis Cloud
const redisClient = createClient({
    url: process.env.REDIS_URL 
});

redisClient.on('error', (err) => console.log(' Redis Client Error:', err));
redisClient.on('connect', () => console.log('Đã kết nối Redis thành công!'));

// Kết nối ngay khi file được gọi
redisClient.connect();

export default redisClient;