import Song from '../models/Songs.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import Artist from '../models/Artist.js';

// 1. Lấy danh sách các bài hát đang chờ duyệt (Moderation Queue)
export const getModerationQueue = async (req, res) => {
    try {
        // Lấy các bài có status là 'flagged' (bị AI nghi ngờ) hoặc 'pending_ai' (nếu kẹt)
        const pendingSongs = await Song.find({ status: { $in: ['flagged', 'pending_ai'] } })
            .populate('artist', 'name image userId')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: pendingSongs.length, songs: pendingSongs });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách chờ duyệt', error: error.message });
    }

};

// 2. Admin quyết định DUYỆT (Approve) bài hát
export const approveSong = async (req, res) => {
    try {
        const { songId } = req.params;
        const song = await Song.findById(songId);

        if (!song) return res.status(404).json({ success: false, message: 'Không tìm thấy bài hát' });

        song.status = 'live'; // Đổi trạng thái thành Live để hiển thị trên App
        await song.save();

        res.status(200).json({ success: true, message: 'Đã DUYỆT bài hát thành công!', song });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi hệ thống', error: error.message });
    }

};

// 3. Admin quyết định TỪ CHỐI (Reject) bài hát
export const rejectSong = async (req, res) => {
    try {
        const { songId } = req.params;
        const song = await Song.findById(songId);

        if (!song) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bài hát' });
        }

        // Chỉ cho phép reject các bài đang ở trạng thái cần review
        if (!['flagged', 'pending_ai'].includes(song.status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Không thể từ chối bài hát đang ở trạng thái "${song.status}"` 
            });
        }

        // === XÓA FILE TRÊN CLOUDINARY ===
        const deletePromises = [];

        if (song.imageUrl) {
            const imagePublicId = getPublicId(song.imageUrl);
            if (imagePublicId) {
                deletePromises.push(
                    cloudinary.uploader.destroy(imagePublicId, { resource_type: 'image' })
                        .catch(err => console.log("Lỗi xóa ảnh:", err.message))
                );
            }
        }

        if (song.audioUrl) {
            const audioPublicId = getPublicId(song.audioUrl);
            if (audioPublicId) {
                deletePromises.push(
                    cloudinary.uploader.destroy(audioPublicId, { resource_type: 'video' })
                        .catch(err => console.log("Lỗi xóa audio:", err.message))
                );
            }
        }

        // Chờ xóa file xong
        await Promise.all(deletePromises);

        // === CẬP NHẬT TRẠNG THÁI ===
        song.status = 'rejected';
        await song.save();

        res.status(200).json({ 
            success: true, 
            message: 'Đã từ chối và xóa file bài hát thành công.', 
            song 
        });

    } catch (error) {
        console.error("Reject Song Error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi hệ thống khi từ chối bài hát', 
            error: error.message 
        });
    }
};

// --- THỐNG KÊ DASHBOARD ---
export const getDashboardStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalArtists = await Artist.countDocuments();
        const totalSongs = await Song.countDocuments();

        // Thống kê bài hát theo trạng thái để vẽ biểu đồ tròn (Pie Chart)
        const songsByStatus = await Song.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const totalPlaysResult = await Song.aggregate([
            { $group: { _id: null, total: { $sum: '$plays' } } }
        ]);
        const totalPlays = totalPlaysResult.length > 0 ? totalPlaysResult[0].total : 0;

        res.status(200).json({
            success: true,
            data: { totalUsers, totalArtists, totalSongs, totalPlays, songsByStatus }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }

};
