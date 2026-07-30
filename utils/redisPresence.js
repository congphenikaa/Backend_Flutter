import redisClient from '../configs/redisConfig.js';

// TTL = 35 giây (phải lớn hơn pingInterval của Socket.IO = 25s)
// Socket.IO tự gửi ping mỗi 25s → mỗi ping ta refresh TTL → user không bao giờ bị expire sai
const PRESENCE_TTL = 35;

/**
 * Đánh dấu user online, lưu socketId để debug/trace
 */
export const setUserOnline = async (userId, socketId) => {
    await redisClient.hSet(`presence:${userId}`, { socketId, status: 'online' });
    await redisClient.expire(`presence:${userId}`, PRESENCE_TTL);
};

/**
 * Đánh dấu user offline — xóa key khỏi Redis
 */
export const setUserOffline = async (userId) => {
    await redisClient.del(`presence:${userId}`);
};

/**
 * Kiểm tra user có đang online không
 */
export const isUserOnline = async (userId) => {
    const exists = await redisClient.exists(`presence:${userId}`);
    return exists === 1;
};

/**
 * Reset TTL — gọi sau mỗi socket event để duy trì trạng thái online
 */
export const refreshPresenceTTL = async (userId) => {
    await redisClient.expire(`presence:${userId}`, PRESENCE_TTL);
};
