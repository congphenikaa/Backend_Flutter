import redisClient from '../configs/redisConfig.js';

const LIMIT  = 5; // Tối đa 5 tin nhắn
const WINDOW = 3; // Trong vòng 3 giây

/**
 * Redis Rate Limiter dành riêng cho Socket events
 *
 * @param {string} userId
 * @param {Function} callback - Socket acknowledgement callback
 * @returns {Promise<boolean>} true nếu được phép, false nếu bị chặn
 */
export const socketRateLimiter = async (userId, callback) => {
    try {
        const key      = `rate_limit:chat:${userId}`;
        const requests = await redisClient.incr(key);

        // Chỉ set TTL lần đầu tiên để tránh reset cửa sổ thời gian
        if (requests === 1) {
            await redisClient.expire(key, WINDOW);
        }

        if (requests > LIMIT) {
            callback({ error: 'Bạn thao tác quá nhanh, vui lòng chậm lại!' });
            return false;
        }

        return true;
    } catch (err) {
        // Nếu Redis lỗi → cho phép đi tiếp, tránh block user không cần thiết
        console.error('[RateLimit] Redis error:', err.message);
        return true;
    }
};
