import redisClient from '../configs/redisConfig.js'; 
import Song from '../models/Songs.js'; 

const chartController = {
    // API Lấy Top Trending (Đã tích hợp Cache + Thuật toán Time Decay)
    getTrendingTop: async (req, res) => {
        try {
            const chartKey = `chart:trending`;
            const cacheKey = `cache:api:top_trending`; 

            // Kiểm tra Cache
            if (redisClient.isReady) {
                const cachedData = await redisClient.get(cacheKey);
                if (cachedData) {
                    console.log("[CACHE HIT] Lấy Trending siêu tốc");
                    return res.status(200).json({ success: true, data: JSON.parse(cachedData) });
                }
            }

            console.log("[CACHE MISS] Tính toán Trending từ MongoDB...");

            const topData = await redisClient.zRangeWithScores(chartKey, 0, 19, { REV: true });

            if (topData.length === 0) return res.status(200).json({ success: true, data: [] });

            const songIds = topData.map(item => item.value);
            const songsInfo = await Song.find({ _id: { $in: songIds }, status: 'live' }).populate('artist');

            const finalCharts = topData.map((redisItem, index) => {
                const songDetail = songsInfo.find(s => s._id.toString() === redisItem.value);
                return {
                    rank: index + 1,
                    trendingScore: redisItem.score, 
                    song: songDetail 
                };
            }).filter(item => item.song); 

            // Lưu Cache Trending 5 phút
            if (redisClient.isReady && finalCharts.length > 0) {
                await redisClient.setEx(cacheKey, 300, JSON.stringify(finalCharts));
            }

            res.status(200).json({ success: true, data: finalCharts });
        } catch (error) {
            console.error("Lỗi getTrendingTop:", error);
            res.status(500).json({ success: false, message: "Lỗi server" });
        }
    }
};

export default chartController;