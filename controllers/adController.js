import Advertisement from '../models/Advertisement.js';
import User from '../models/User.js';
import redisClient from '../configs/redisConfig.js';

// Lấy quảng cáo tiếp theo (random dựa trên priority)
export const getNextAd = async (req, res) => {
    try {
        const userId = req.user.id;

        // Kiểm tra Redis xem user có đang trong thời gian Ad-Free không (rewarded)
        const adFreeKey = `ad_free_until:${userId}`;
        const isAdFree = await redisClient.get(adFreeKey);

        if (isAdFree) {
            return res.json({ success: false, message: "User is in ad-free period", isAdFree: true });
        }

        // Kiểm tra User có phải Premium không
        const user = await User.findById(userId);
        if (user && user.isPremium && (!user.premiumExpiresAt || user.premiumExpiresAt > new Date())) {
            return res.json({ success: false, message: "User is Premium", isAdFree: true });
        }

        const now = new Date();
        let query = {
            isActive: true,
            $or: [
                { endDate: { $exists: false } },
                { endDate: null },
                { endDate: { $gt: now } }
            ]
        };

        if (req.query.type) {
            query.type = req.query.type;
        }

        const ads = await Advertisement.find(query);

        if (ads.length === 0) {
            return res.json({ success: false, message: "No active ads available", isAdFree: false });
        }

        // Chọn random dựa trên priority (trọng số)
        let totalPriority = 0;
        ads.forEach(ad => totalPriority += (ad.priority || 1));

        let randomNum = Math.random() * totalPriority;
        let selectedAd = ads[0];

        for (const ad of ads) {
            randomNum -= (ad.priority || 1);
            if (randomNum <= 0) {
                selectedAd = ad;
                break;
            }
        }

        res.json({ success: true, ad: selectedAd, isAdFree: false });

    } catch (error) {
        console.error("Lỗi getNextAd:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// Ghi nhận đã phát quảng cáo (tăng playCount)
export const recordAdPlayed = async (req, res) => {
    try {
        const { id } = req.params;
        await Advertisement.findByIdAndUpdate(id, { $inc: { playCount: 1 } });
        res.json({ success: true, message: "Ad play recorded" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// Ghi nhận click quảng cáo
export const recordAdClick = async (req, res) => {
    try {
        const { id } = req.params;
        await Advertisement.findByIdAndUpdate(id, { $inc: { clickCount: 1 } });
        res.json({ success: true, message: "Ad click recorded" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// Cấp phần thưởng Ad-Free (30 phút)
export const grantAdFreeReward = async (req, res) => {
    try {
        const userId = req.user.id;
        const durationMinutes = 30; // 30 phút
        const adFreeKey = `ad_free_until:${userId}`;

        // Set key với TTL (time-to-live) là 30 phút (1800 giây)
        await redisClient.set(adFreeKey, "active", {
            EX: durationMinutes * 60
        });

        res.json({ success: true, message: `Granted ${durationMinutes} minutes of ad-free listening` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};

// Kiểm tra trạng thái Ad-Free
export const checkAdFreeStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        // Check user Premium first
        const user = await User.findById(userId);
        if (user && user.isPremium && (!user.premiumExpiresAt || user.premiumExpiresAt > new Date())) {
            return res.json({ success: true, isAdFree: true, isPremium: true });
        }

        const adFreeKey = `ad_free_until:${userId}`;
        const ttl = await redisClient.ttl(adFreeKey); // Trả về số giây còn lại, -2 nếu không tồn tại

        if (ttl > 0) {
            res.json({ success: true, isAdFree: true, remainingSeconds: ttl, isPremium: false });
        } else {
            res.json({ success: true, isAdFree: false, remainingSeconds: 0, isPremium: false });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống" });
    }
};
