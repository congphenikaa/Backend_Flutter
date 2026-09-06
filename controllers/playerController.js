import redisClient from '../configs/redisConfig.js';
import Song from '../models/Songs.js';
import User from '../models/User.js';

// ─── Hằng số ───────────────────────────────────────────────────────────────
const MAX_RECENTLY_PLAYED = 50; // Số bài tối đa lưu trong lịch sử

// ─── [POST] /api/player/skip ────────────────────────────────────────────────
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

// ─── [POST] /api/player/recently-played ────────────────────────────────────
// Ghi một bài hát vào lịch sử nghe gần đây của user.
// Nguyên tắc Deduplication:
//   - Redis ZADD: mặc định là Upsert → nếu songId đã có thì ghi đè score (timestamp) mới.
//     Bài mới nhất có score cao nhất → luôn nổi lên đầu khi đọc bằng ZRANGE REV.
//   - MongoDB: $pull xóa bài cũ (nếu có) → $push $position:0 chèn lên đầu → $slice: 50 (số dương)
//     giữ 50 phần tử từ đầu mảng (tức là 50 bài mới nhất).
export const recordRecentlyPlayed = async (req, res) => {
    try {
        const userId = req.user.id;
        const { songId } = req.body;

        if (!songId) {
            return res.status(400).json({ success: false, message: "Thiếu songId." });
        }

        const redisKey = `recently_played:${userId}`;
        const score = Date.now(); // Unix timestamp milliseconds làm điểm số

        // ── Tier 1: Redis ZSET ──────────────────────────────────────────────
        // ZADD mặc định là upsert: nếu songId đã tồn tại → cập nhật score mới.
        // Không cần flag NX hay GT — một lệnh duy nhất là đủ.
        if (redisClient.isReady) {
            await redisClient.zAdd(redisKey, { score, value: songId });
            // Cắt đuôi: giữ lại 50 bài có score cao nhất (mới nhất).
            // ZREMRANGEBYRANK <key> 0 -51 → xóa tất cả phần tử từ rank 0
            // đến rank -(MAX+1), tức là xóa bài cũ nhất nếu vượt quá giới hạn.
            await redisClient.zRemRangeByRank(redisKey, 0, -(MAX_RECENTLY_PLAYED + 1));
            // Đặt/gia hạn TTL 30 ngày mỗi khi user nghe nhạc.
            // Nếu user không mở app quá 30 ngày, Redis tự xóa key để giải phóng RAM.
            // Khi user quay lại, cơ chế fallback MongoDB sẽ tự phục hồi cache.
            await redisClient.expire(redisKey, 2592000); // 30 ngày = 2592000 giây
        }

        // ── Tier 2: MongoDB (Persistent backup) ────────────────────────────
        // Bước 1: $pull xóa songId cũ nếu đã tồn tại → tránh trùng lặp.
        // Bước 2: $push + $position:0 chèn lên đầu mảng (index 0 = mới nhất).
        //         $slice: 50 (số DƯƠNG) → MongoDB giữ 50 phần tử tính từ đầu mảng.
        //         KHÔNG dùng -50 vì $slice âm giữ đuôi mảng → xóa mất bài mới nhất.
        await User.findByIdAndUpdate(userId, {
            $pull: { recentlyPlayed: songId },
        });
        await User.findByIdAndUpdate(userId, {
            $push: {
                recentlyPlayed: {
                    $each: [songId],
                    $position: 0,
                    $slice: MAX_RECENTLY_PLAYED,
                },
            },
        });

        res.status(200).json({ success: true, message: "Đã ghi lịch sử nghe." });

    } catch (error) {
        console.error("Lỗi recordRecentlyPlayed:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ nội bộ." });
    }
};

// ─── [GET] /api/player/recently-played?limit=15 ────────────────────────────
// Trả về danh sách bài hát nghe gần đây.
// Chiến lược đọc: Redis trước (nhanh) → fallback MongoDB nếu cache miss.
// Sau khi fallback, re-populate Redis để lần sau nhanh hơn.
export const getRecentlyPlayed = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Math.min(parseInt(req.query.limit) || 15, MAX_RECENTLY_PLAYED);

        const redisKey = `recently_played:${userId}`;
        let songIds = [];

        // ── Đọc từ Redis ZSET (ưu tiên) ────────────────────────────────────
        // ZRANGE REV: lấy theo thứ tự score giảm dần (mới nhất trước)
        if (redisClient.isReady) {
            const rawIds = await redisClient.zRange(redisKey, 0, limit - 1, { REV: true });
            songIds = rawIds;
        }

        // ── Fallback: đọc từ MongoDB nếu Redis trống ───────────────────────
        if (songIds.length === 0) {
            console.log(`[RECENTLY_PLAYED] Redis miss cho user ${userId}, fallback MongoDB`);
            const user = await User.findById(userId)
                .select('recentlyPlayed')
                .populate({
                    path: 'recentlyPlayed',
                    select: '_id title artist audioUrl imageUrl album duration plays description',
                    populate: { path: 'artist', select: 'name' },
                });

            if (!user || !user.recentlyPlayed || user.recentlyPlayed.length === 0) {
                return res.status(200).json({ success: true, data: [] });
            }

            const slicedSongs = user.recentlyPlayed.slice(0, limit);

            // Re-populate Redis từ MongoDB để cache lại cho lần sau
            if (redisClient.isReady) {
                const pipeline = redisClient.multi();
                slicedSongs.forEach((song, index) => {
                    // Score = Date.now() - index*1000 để giữ thứ tự đúng (mới nhất = score cao)
                    pipeline.zAdd(redisKey, {
                        score: Date.now() - index * 1000,
                        value: song._id.toString(),
                    });
                });
                await pipeline.exec();
                await redisClient.zRemRangeByRank(redisKey, 0, -(MAX_RECENTLY_PLAYED + 1));
                // Đặt TTL 30 ngày cho key vừa được khôi phục từ MongoDB.
                // Mỗi lần fallback = user vừa quay lại app → reset thêm 30 ngày.
                await redisClient.expire(redisKey, 2592000); // 30 ngày = 2592000 giây
            }

            return res.status(200).json({ success: true, data: slicedSongs });
        }

        // ── Populate thông tin bài hát từ MongoDB (theo thứ tự Redis) ──────
        const songs = await Song.find({ _id: { $in: songIds }, status: 'live' })
            .populate('artist', 'name')
            .select('_id title artist audioUrl imageUrl album duration plays description');

        // Giữ đúng thứ tự từ Redis (mới nhất trước)
        const orderedSongs = songIds
            .map(id => songs.find(s => s._id.toString() === id))
            .filter(Boolean);

        res.status(200).json({ success: true, data: orderedSongs });

    } catch (error) {
        console.error("Lỗi getRecentlyPlayed:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ nội bộ." });
    }
};
