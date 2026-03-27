import cron from 'node-cron';
import redisClient from '../configs/redisConfig.js';
import Song from '../models/Songs.js';

console.log(" [CronJob] Tiến trình kiểm tra rớt hạng Trending đã sẵn sàng...");

// Cài đặt chạy tự động mỗi 30 phút (Cú pháp: '*/30 * * * *')
// Để test thử nhanh, bạn có thể đổi thành '*/1 * * * *' (Mỗi 1 phút)
cron.schedule('*/1 * * * *', async () => {
    try {
        if (!redisClient.isReady) return;

        // TỐI ƯU 1: Chỉ lấy Top 100 bài hát cao điểm nhất từ Redis
        const top100Ids = await redisClient.zRange('chart:trending', 0, 99, { REV: true });
        
        if (top100Ids.length === 0) return;

        // TỐI ƯU 2: Truy vấn MongoDB siêu nhẹ (Chỉ lấy plays và createdAt)
        // Dùng .select() để loại bỏ các trường nặng như ảnh, audio, mô tả...
        const songs = await Song.find({ _id: { $in: top100Ids } }).select('plays createdAt');

        // TỐI ƯU 3: Sử dụng Redis Pipeline (Gom lệnh)
        // Thay vì gửi 100 request tới Redis, ta gom lại thành 1 gói duy nhất
        const pipeline = redisClient.multi();

        let updatedCount = 0;

        for (const song of songs) {
            // Tính toán lại tuổi đời tính đến thời điểm HIỆN TẠI
            const ageInMs = new Date() - new Date(song.createdAt);
            const ageInHours = ageInMs / (1000 * 60 * 60);
            
            // Công thức Time Decay (Gravity = 1.5)
            const gravity = 1.5;
            const newTrendingScore = song.plays / Math.pow(ageInHours + 2, gravity);

            // Đưa lệnh update vào Pipeline
            pipeline.zAdd('chart:trending', {
                score: newTrendingScore,
                value: song._id.toString()
            });

            updatedCount++;
        }

        // Thực thi toàn bộ pipeline cùng 1 lúc
        await pipeline.exec();
        
        console.log(` [CronJob] Đã tính toán và cập nhật rớt hạng cho ${updatedCount} bài hát trong Top 100.`);

    } catch (error) {
        console.error(" [CronJob] Lỗi cập nhật rớt hạng Trending:", error);
    }
});