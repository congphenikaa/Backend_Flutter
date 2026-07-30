import Advertisement from '../models/Advertisement.js';
import { v2 as cloudinary } from 'cloudinary';

// GET all ads (with pagination and search)
export const getAds = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const search = req.query.search || '';
        const type = req.query.type || '';
        const status = req.query.status || '';

        const query = {};

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { advertiserName: { $regex: search, $options: 'i' } }
            ];
        }

        if (type) {
            query.type = type;
        }

        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }

        const skip = (page - 1) * limit;
        const total = await Advertisement.countDocuments(query);
        const ads = await Advertisement.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            ads,
            total,
            page,
            limit
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống", error: error.message });
    }
};

// CREATE ad
export const createAd = async (req, res) => {
    try {
        const { title, advertiserName, clickUrl, type, durationSeconds, isActive, priority, startDate, endDate } = req.body;
        
        let audioUrl = "";
        let bannerImageUrl = "";

        if (req.files && req.files.audio) {
            audioUrl = req.files.audio[0].path;
        }
        if (req.files && req.files.image) {
            bannerImageUrl = req.files.image[0].path;
        }

        // Validate
        if (!title || !advertiserName || !bannerImageUrl) {
            if (audioUrl) await cloudinary.uploader.destroy(req.files.audio[0].filename, { resource_type: 'video' }).catch(e=>console.log(e));
            if (bannerImageUrl) await cloudinary.uploader.destroy(req.files.image[0].filename, { resource_type: 'image' }).catch(e=>console.log(e));
            return res.json({ success: false, message: "Thiếu thông tin bắt buộc (Tiêu đề, Tên nhà quảng cáo, Ảnh Banner)" });
        }

        if (type !== 'banner' && !audioUrl) {
            return res.json({ success: false, message: "Quảng cáo âm thanh/rewarded cần có file audio" });
        }

        const newAd = new Advertisement({
            title,
            advertiserName,
            audioUrl,
            bannerImageUrl,
            clickUrl,
            type: type || 'audio',
            durationSeconds: durationSeconds || 15,
            isActive: isActive !== undefined ? isActive : true,
            priority: priority || 1,
            startDate: startDate || Date.now(),
            endDate: (endDate && endDate !== 'null') ? endDate : null
        });

        await newAd.save();
        res.json({ success: true, message: "Thêm quảng cáo thành công", ad: newAd });

    } catch (error) {
        console.error("Lỗi createAd:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

const getPublicId = (url) => {
    if (!url) return null;
    const segments = url.split('/');
    const lastPart = segments.pop(); 
    const folderPart = segments.pop(); 
    const filename = lastPart.split('.')[0];
    return `${folderPart}/${filename}`;
};

// UPDATE ad
export const updateAd = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, advertiserName, clickUrl, type, durationSeconds, isActive, priority, startDate, endDate } = req.body;

        const ad = await Advertisement.findById(id);
        if (!ad) return res.json({ success: false, message: "Không tìm thấy quảng cáo" });

        ad.title = title || ad.title;
        ad.advertiserName = advertiserName || ad.advertiserName;
        if (clickUrl !== undefined) ad.clickUrl = clickUrl;
        if (type) ad.type = type;
        if (durationSeconds) ad.durationSeconds = durationSeconds;
        if (isActive !== undefined) ad.isActive = isActive;
        if (priority) ad.priority = priority;
        if (startDate) ad.startDate = startDate;
        if (endDate !== undefined) ad.endDate = (endDate === 'null' ? null : endDate);

        if (req.files && req.files.image) {
            if (ad.bannerImageUrl) {
                const oldImgId = getPublicId(ad.bannerImageUrl);
                if (oldImgId) await cloudinary.uploader.destroy(oldImgId, { resource_type: 'image' }).catch(e=>console.log(e));
            }
            ad.bannerImageUrl = req.files.image[0].path;
        }

        if (req.files && req.files.audio) {
            if (ad.audioUrl) {
                const oldAudioId = getPublicId(ad.audioUrl);
                if (oldAudioId) await cloudinary.uploader.destroy(oldAudioId, { resource_type: 'video' }).catch(e=>console.log(e));
            }
            ad.audioUrl = req.files.audio[0].path;
        }

        await ad.save();
        res.json({ success: true, message: "Cập nhật quảng cáo thành công", ad });
    } catch (error) {
        console.error("Lỗi updateAd:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// DELETE ad
export const deleteAd = async (req, res) => {
    try {
        const { id } = req.params;
        const ad = await Advertisement.findById(id);
        if (!ad) return res.json({ success: false, message: "Không tìm thấy quảng cáo" });

        if (ad.bannerImageUrl) {
            const oldImgId = getPublicId(ad.bannerImageUrl);
            if (oldImgId) await cloudinary.uploader.destroy(oldImgId, { resource_type: 'image' }).catch(e=>console.log(e));
        }

        if (ad.audioUrl) {
            const oldAudioId = getPublicId(ad.audioUrl);
            if (oldAudioId) await cloudinary.uploader.destroy(oldAudioId, { resource_type: 'video' }).catch(e=>console.log(e));
        }

        await Advertisement.findByIdAndDelete(id);
        res.json({ success: true, message: "Xóa quảng cáo thành công" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// STATS
export const getAdStats = async (req, res) => {
    try {
        const ads = await Advertisement.find();
        let totalPlays = 0;
        let totalClicks = 0;
        let activeAds = 0;

        ads.forEach(ad => {
            totalPlays += ad.playCount;
            totalClicks += ad.clickCount;
            if (ad.isActive) activeAds++;
        });

        const ctr = totalPlays > 0 ? ((totalClicks / totalPlays) * 100).toFixed(2) : 0;

        res.json({
            success: true,
            stats: {
                totalAds: ads.length,
                activeAds,
                totalPlays,
                totalClicks,
                averageCtr: ctr
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};
