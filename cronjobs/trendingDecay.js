import cron from 'node-cron';
import redisClient from '../configs/redisConfig.js';
import Song from '../models/Songs.js';

console.log(" [CronJob] Các tiến trình quản lý Trending đã sẵn sàng...");

// ============================================================================
// CRONJOB 1: CẬP NHẬT RỚT HẠNG THEO THỜI GIAN (Chạy mỗi 30 phút)
// Mục đích: Ép các bài Top trending bị trừ điểm nếu thời gian trôi qua
// ============================================================================
cron.schedule('*/30 * * * *', async () => {
    try {
        if (!redisClient.isReady) return;

        // Chỉ lấy Top 100 bài hát cao điểm nhất từ Redis
        const top100Ids = await redisClient.zRange('chart:trending', 0, 99, { REV: true });
        
        if (top100Ids.length === 0) return;

        // Truy vấn MongoDB siêu nhẹ
        const songs = await Song.find({ _id: { $in: top100Ids } }).select('plays createdAt');

        // Sử dụng Redis Pipeline (Gom lệnh)
        const pipeline = redisClient.multi();
        let updatedCount = 0;

        for (const song of songs) {
            const ageInMs = new Date() - new Date(song.createdAt);
            const ageInHours = ageInMs / (1000 * 60 * 60);
            
            const gravity = 1.5;
            const newTrendingScore = song.plays / Math.pow(ageInHours + 2, gravity);

            pipeline.zAdd('chart:trending', {
                score: newTrendingScore,
                value: song._id.toString()
            });

            updatedCount++;
        }

        await pipeline.exec();
        console.log(` [CronJob - 30m] Đã cập nhật rớt hạng cho ${updatedCount} bài hát trong Top 100.`);

    } catch (error) {
        console.error(" [CronJob - 30m] Lỗi cập nhật rớt hạng Trending:", error);
    }
});

// ============================================================================
// CRONJOB 2: DỌN DẸP RÁC REDIS (Chạy 1 lần/ngày vào lúc 03:00 sáng)
// Cú pháp: '0 3 * * *' (Phút 0, Giờ 3, mọi ngày, mọi tháng, mọi thứ)
// Mục đích: Xóa các bài hát rớt hạng quá sâu để giải phóng RAM cho Redis
// ============================================================================
cron.schedule('0 3 * * *', async () => {
    try {
        if (!redisClient.isReady) return;

        console.log(" [CronJob - Daily] Bắt đầu dọn dẹp rác Redis...");

        // Xóa tất cả các phần tử, NGOẠI TRỪ 1000 phần tử có điểm cao nhất.
        // Giải thích cú pháp (0, -1001):
        // 0: Vị trí thấp nhất (điểm bét bảng)
        // -1001: Phần tử đứng thứ 1001 tính từ trên cao xuống.
        // Nếu tổng bài hát < 1000, lệnh này an toàn và không làm gì cả.
        const removedCount = await redisClient.zRemRangeByRank('chart:trending', 0, -1001);

        console.log(` [CronJob - Daily] Đã dọn dẹp ${removedCount} bài hát rớt hạng sâu khỏi bộ nhớ Redis.`);

    } catch (error) {
        console.error(" [CronJob - Daily] Lỗi dọn dẹp Redis:", error);
    }
});