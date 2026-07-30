import redisClient from '../configs/redisConfig.js';

export const skipSong = async (req, res) => {
    try {
        const userId = req.user.id;

        const redisKey = `skip_count:${userId}`;
        const maxSkips = 6;
        const ttl = 3600; // 1 hour

        // Lấy số lần đã skip từ Redis
        let skips = await redisClient.get(redisKey);
        
        if (skips) {
            skips = parseInt(skips);
            if (skips >= maxSkips) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn đã hết lượt bỏ qua. Vui lòng nâng cấp Premium để bỏ qua không giới hạn."
                });
            }
            // Nếu chưa quá giới hạn thì tăng biến đếm
            await redisClient.incr(redisKey);
        } else {
            // Nếu chưa có khóa, tạo mới với giá trị 1 và gán TTL
            await redisClient.setEx(redisKey, ttl, "1");
        }

        res.status(200).json({
            success: true,
            message: "Cho phép chuyển bài."
        });

    } catch (error) {
        console.error("Lỗi trong skipSong:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi máy chủ nội bộ."
        });
    }
};
