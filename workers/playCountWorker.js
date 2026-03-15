import { Worker } from 'bullmq';
import { connection } from '../configs/queueConfig.js';
import Song from '../models/Songs.js';
import redisClient from '../configs/redisConfig.js';

console.log("👷 [Worker] Nhân viên đếm lượt nghe đang chạy ngầm...");

// Khởi tạo Worker giám sát 'play-count-queue'
const worker = new Worker('play-count-queue', async (job) => {
    // Rút ID bài hát từ data gửi tới
    const { songId } = job.data;
    
    try {
        // --- CHUYỂN TOÀN BỘ LOGIC CẬP NHẬT DATABASE VÀO ĐÂY ---
        const updatedSong = await Song.findByIdAndUpdate(
            songId, 
            { $inc: { plays: 1 } },
            { new: true } // Lấy document sau khi đã +1
        );

        if (updatedSong && redisClient.isReady) {
            // Tính toán và Cập nhật Top Trending (Time Decay)
            const ageInMs = new Date() - new Date(updatedSong.createdAt);
            const ageInHours = ageInMs / (1000 * 60 * 60);
            
            const gravity = 1.5;
            const trendingScore = updatedSong.plays / Math.pow(ageInHours + 2, gravity);

            await redisClient.zAdd('chart:trending', {
                score: trendingScore,
                value: songId
            });
            
            console.log(`✅ [Worker] Đã xử lý thành công +1 view cho: ${updatedSong.title}`);
        }
    } catch (error) {
        console.error(`❌ [Worker] Lỗi xử lý bài hát ${songId}:`, error);
    }
}, { connection });

// Bắt lỗi rớt mạng của Worker
worker.on('error', err => {
    console.error('❌ [Worker] Sập nguồn:', err);
});

export default worker;