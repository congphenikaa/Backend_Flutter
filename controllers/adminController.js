import Song from '../models/Songs.js';
import PendingSong from '../models/PendingSong.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import Artist from '../models/Artist.js';
import Transaction from '../models/Transaction.js';
import ArtistRequest from '../models/ArtistRequest.js';
import CopyrightStrike from '../models/CopyrightStrike.js';
import Advertisement from '../models/Advertisement.js';
import Album from '../models/Album.js';
import Playlist from '../models/Playlist.js';
import Coupon from '../models/Coupon.js';
import { v2 as cloudinary } from 'cloudinary';

const getCloudinaryPublicId = (url) => {
    if (!url || typeof url !== 'string' || !url.includes('/upload/')) {
        return null;
    }

    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/');
    const fileName = parts.pop();
    const folder = parts.pop();

    if (!fileName || !folder) {
        return null;
    }

    return `${folder}/${fileName.split('.')[0]}`;
};

// 1. Lấy danh sách các bài hát đang chờ duyệt (Moderation Queue)
export const getModerationQueue = async (req, res) => {
    try {
        const pendingSongs = await PendingSong.find({ status: 'pending_review' })
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
        const pendingSong = await PendingSong.findById(songId);

        if (!pendingSong) return res.status(404).json({ success: false, message: 'Không tìm thấy bài hát' });

        const approvedSong = await Song.create({
            _id: pendingSong._id,
            title: pendingSong.title,
            description: pendingSong.description,
            audioUrl: pendingSong.audioUrl,
            imageUrl: pendingSong.imageUrl,
            duration: pendingSong.duration,
            status: 'live',
            aiSimilarityScore: pendingSong.aiSimilarityScore,
            aiMatchedSong: pendingSong.aiMatchedSong,
            artist: pendingSong.artist,
            album: pendingSong.album,
            category: pendingSong.category,
            plays: 0
        });

        await PendingSong.findByIdAndDelete(songId);

        res.status(200).json({ success: true, message: 'Đã DUYỆT bài hát thành công!', song: approvedSong });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi hệ thống', error: error.message });
    }

};

// 3. Admin quyết định TỪ CHỐI (Reject) bài hát
export const rejectSong = async (req, res) => {
    try {
        const { songId } = req.params;
        const song = await PendingSong.findById(songId);

        if (!song) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bài hát' });
        }

        // === XÓA FILE TRÊN CLOUDINARY ===
        const deletePromises = [];

        if (song.imageUrl) {
            const imagePublicId = getCloudinaryPublicId(song.imageUrl);
            if (imagePublicId) {
                deletePromises.push(
                    cloudinary.uploader.destroy(imagePublicId, { resource_type: 'image' })
                        .catch(err => console.log("Lỗi xóa ảnh:", err.message))
                );
            }
        }

        if (song.audioUrl) {
            const audioPublicId = getCloudinaryPublicId(song.audioUrl);
            if (audioPublicId) {
                deletePromises.push(
                    cloudinary.uploader.destroy(audioPublicId, { resource_type: 'video' })
                        .catch(err => console.log("Lỗi xóa audio:", err.message))
                );
            }
        }

        // Chờ xóa file xong
        await Promise.all(deletePromises);

        await PendingSong.findByIdAndDelete(songId);

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
let dashboardStatsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

export const getDashboardStats = async (req, res) => {
    try {
        const rangeDays = parseInt(req.query.range) || 7;
        const cacheKey = `stats_${rangeDays}`;

        // Kiểm tra cache
        if (dashboardStatsCache && dashboardStatsCache.key === cacheKey && (Date.now() - lastCacheTime < CACHE_TTL)) {
            return res.status(200).json({ success: true, data: dashboardStatsCache.data });
        }

        // ==============================
        // 1. TỔNG QUAN HỆ THỐNG (Counts)
        // ==============================
        const [
            totalUsers, premiumUsers, totalArtists, 
            liveSongCount, pendingSongsCount,
            totalPlaylists, totalAlbums, totalCategories,
            activeAds, activeCoupons, pendingArtistRequests, totalStrikes
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isPremium: true }),
            Artist.countDocuments(),
            Song.countDocuments({ status: 'live' }),
            PendingSong.countDocuments({ status: 'pending_review' }),
            Playlist.countDocuments(),
            Album.countDocuments(),
            Category.countDocuments(),
            Advertisement.countDocuments({ isActive: true }),
            Coupon.countDocuments({ isActive: true }),
            ArtistRequest.countDocuments({ status: 'pending' }),
            CopyrightStrike.countDocuments()
        ]);

        const totalSongs = liveSongCount + pendingSongsCount;

        // Tổng doanh thu & Tổng lượt nghe
        const [totalPlaysResult, totalRevenueResult] = await Promise.all([
            Song.aggregate([{ $group: { _id: null, total: { $sum: '$plays' } } }]),
            Transaction.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$finalAmount' } } }
            ])
        ]);

        const totalPlays = totalPlaysResult.length > 0 ? totalPlaysResult[0].total : 0;
        const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;

        // Thống kê bài hát theo trạng thái
        const liveSongsByStatus = await Song.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
        const songsByStatus = [...liveSongsByStatus, { _id: 'pending_review', count: pendingSongsCount }];

        // ==============================
        // 2. DỮ LIỆU BIỂU ĐỒ (Time Series)
        // ==============================
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (rangeDays - 1));
        startDate.setHours(0, 0, 0, 0);

        const [uploadsData, pendingData, revenueData, userGrowthData] = await Promise.all([
            Song.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
            ]),
            PendingSong.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
            ]),
            Transaction.aggregate([
                { $match: { createdAt: { $gte: startDate }, status: 'success' } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amount: { $sum: '$finalAmount' } } }
            ]),
            User.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }
            ])
        ]);

        const chartData = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 0; i < rangeDays; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            const uploadObj = uploadsData.find(d => d._id === dateStr);
            const pendingObj = pendingData.find(d => d._id === dateStr);
            const revenueObj = revenueData.find(d => d._id === dateStr);
            const userObj = userGrowthData.find(d => d._id === dateStr);
            
            chartData.push({
                name: rangeDays <= 14 ? dayNames[date.getDay()] : dateStr.slice(5), // Hiển thị thứ nếu <=14 ngày, ngược lại hiện MM-DD
                date: dateStr,
                uploads: uploadObj ? uploadObj.count : 0,
                pending: pendingObj ? pendingObj.count : 0,
                revenue: revenueObj ? revenueObj.amount : 0,
                newUsers: userObj ? userObj.count : 0,
            });
        }

        // ==============================
        // 3. TOP CONTENT
        // ==============================
        const topSongs = await Song.find({ status: 'live' })
            .sort({ plays: -1 })
            .limit(5)
            .populate('artist', 'name image');

        const responseData = { 
            totalUsers, premiumUsers, totalArtists, 
            totalSongs, totalPlays, totalRevenue,
            songsByStatus, chartData, topSongs,
            totalPlaylists, totalAlbums, totalCategories,
            activeAds, activeCoupons, 
            pendingArtistRequests, totalStrikes
        };

        // Lưu cache
        dashboardStatsCache = { key: cacheKey, data: responseData };
        lastCacheTime = Date.now();

        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- QUẢN LÝ NGƯỜI DÙNG ---

// Lấy danh sách người dùng (có phân trang, tìm kiếm, lọc)
export const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { search, role, isActive } = req.query;

        // Xây dựng query filter
        const filter = {};
        
        if (search) {
            filter.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (role) {
            filter.role = role;
        }

        if (isActive !== undefined && isActive !== '') {
            filter.isActive = isActive === 'true';
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password') // Không trả về password
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            users
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách người dùng', error: error.message });
    }
};

// Cập nhật Role người dùng
export const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        // Chặn Admin tự hạ quyền chính mình
        if (req.user.id === id) {
            return res.status(403).json({ success: false, message: 'Bạn không thể tự thay đổi quyền của chính mình.' });
        }

        const validRoles = ['user', 'artist', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Role không hợp lệ.' });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }

        res.status(200).json({ success: true, message: 'Cập nhật quyền thành công.', user });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi cập nhật quyền người dùng', error: error.message });
    }
};

// Khóa / Mở khóa người dùng (Soft Delete)
export const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        // Chặn Admin tự khóa tài khoản chính mình
        if (req.user.id === id) {
            return res.status(403).json({ success: false, message: 'Bạn không thể tự khóa tài khoản của chính mình.' });
        }

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Trạng thái isActive không hợp lệ.' });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }

        res.status(200).json({ 
            success: true, 
            message: isActive ? 'Đã mở khóa tài khoản thành công.' : 'Đã khóa tài khoản thành công.', 
            user 
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái người dùng', error: error.message });
    }
};
