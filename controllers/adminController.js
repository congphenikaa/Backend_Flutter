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

        if (!song) return res.status(404).json({ success: false, message: 'Không tìm thấy bài hát' });

        song.status = 'rejected';
        // Có thể bổ sung logic gọi API Cloudinary để xóa file audio/image cho đỡ tốn dung lượng

        await song.save();

        res.status(200).json({ success: true, message: 'Đã TỪ CHỐI bài hát!', song });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi hệ thống', error: error.message });
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

// --- QUẢN LÝ THỂ LOẠI (CATEGORY) ---
export const addCategory = async (req, res) => {
    try {
        const { name, color } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Vui lòng tải lên ảnh đại diện cho Thể loại' });
        }

        const category = await Category.create({
            name,
            color: color || '#000000',
            image: req.file.path // URL từ Cloudinary storage
        });

        res.status(201).json({ success: true, message: 'Thêm thể loại thành công!', category });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }

};

export const getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
