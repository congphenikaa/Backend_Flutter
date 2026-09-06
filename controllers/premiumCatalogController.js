import PremiumPlan from '../models/PremiumPlan.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { getIO } from '../sockets/index.js';
import { sendPushNotification } from '../utils/fcmHelper.js';

const toPlanResponse = (plan) => ({
    _id: plan._id,
    code: plan.code,
    title: plan.title,
    description: plan.description,
    price: plan.price,
    originalPrice: plan.originalPrice,
    badgeText: plan.badgeText,
    durationDays: plan.durationDays,
    features: plan.features || [],
    isFeatured: plan.isFeatured,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    maxRoomListeners: plan.maxRoomListeners ?? 2,
    allowFreeListeners: plan.allowFreeListeners !== false,
    maxGroupMembers: plan.maxGroupMembers ?? 5,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
});

const toCouponResponse = (coupon) => ({
    _id: coupon._id,
    code: coupon.code,
    title: coupon.title,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minimumAmount: coupon.minimumAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
    startDate: coupon.startDate,
    endDate: coupon.endDate,
    isActive: coupon.isActive,
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
});

const normalizeCode = (value) => (value || '').trim().toUpperCase();

const parseList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const parseOptionalNumber = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};

const parseOptionalDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildPlanPayload = (body) => ({
    code: normalizeCode(body.code),
    title: body.title,
    description: body.description,
    price: Number(body.price),
    originalPrice: parseOptionalNumber(body.originalPrice),
    badgeText: body.badgeText || '',
    durationDays: Number(body.durationDays),
    features: parseList(body.features),
    isFeatured: body.isFeatured === 'true' || body.isFeatured === true,
    isActive: body.isActive === 'true' || body.isActive === true,
    sortOrder: parseOptionalNumber(body.sortOrder) ?? 0,
    maxRoomListeners: parseOptionalNumber(body.maxRoomListeners) ?? 2,
    allowFreeListeners: body.allowFreeListeners === 'true' || body.allowFreeListeners === true,
    maxGroupMembers: parseOptionalNumber(body.maxGroupMembers) ?? 5,
});

const buildCouponPayload = (body) => ({
    code: normalizeCode(body.code),
    title: body.title,
    description: body.description || '',
    discountType: body.discountType || 'percent',
    discountValue: Number(body.discountValue),
    minimumAmount: parseOptionalNumber(body.minimumAmount) ?? 0,
    maxDiscountAmount: parseOptionalNumber(body.maxDiscountAmount),
    usageLimit: parseOptionalNumber(body.usageLimit),
    startDate: parseOptionalDate(body.startDate),
    endDate: parseOptionalDate(body.endDate),
    isActive: body.isActive === 'true' || body.isActive === true,
});

export const getPublicPremiumPlans = async (req, res) => {
    try {
        const plans = await PremiumPlan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
        return res.status(200).json({ success: true, plans: plans.map(toPlanResponse) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy danh sách gói premium', error: error.message });
    }
};

export const validateCoupon = async (req, res) => {
    try {
        const { code, amount } = req.body;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Thiếu mã giảm giá' });
        }

        const coupon = await Coupon.findOne({ code: normalizeCode(code), isActive: true });
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Mã giảm giá không hợp lệ' });
        }

        const now = new Date();
        if ((coupon.startDate && coupon.startDate > now) || (coupon.endDate && coupon.endDate < now)) {
            return res.status(400).json({ success: false, message: 'Mã giảm giá đã hết hạn' });
        }

        const orderAmount = Number(amount || 0);
        if (coupon.minimumAmount && orderAmount < coupon.minimumAmount) {
            return res.status(400).json({ success: false, message: 'Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá' });
        }

        if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: 'Mã giảm giá đã hết lượt sử dụng' });
        }

        let discountAmount = coupon.discountType === 'fixed'
            ? coupon.discountValue
            : orderAmount * (coupon.discountValue / 100);

        if (coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount !== undefined) {
            discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
        }

        const finalAmount = Math.max(0, orderAmount - discountAmount);

        return res.status(200).json({
            success: true,
            coupon: toCouponResponse(coupon),
            discountAmount,
            finalAmount,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi kiểm tra mã giảm giá', error: error.message });
    }
};

export const getAdminPremiumPlans = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;

        const query = {};
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [plans, total] = await Promise.all([
            PremiumPlan.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(Number(limit)),
            PremiumPlan.countDocuments(query),
        ]);

        return res.status(200).json({
            success: true,
            plans: plans.map(toPlanResponse),
            total,
            page: Number(page),
            limit: Number(limit),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy danh sách gói', error: error.message });
    }
};

export const createPremiumPlan = async (req, res) => {
    try {
        const payload = buildPlanPayload(req.body);
        if (!payload.code || !payload.title || !payload.description || Number.isNaN(payload.price) || Number.isNaN(payload.durationDays)) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu gói premium' });
        }

        const plan = await PremiumPlan.create(payload);
        return res.status(201).json({ success: true, plan: toPlanResponse(plan) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi tạo gói premium', error: error.message });
    }
};

export const updatePremiumPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = buildPlanPayload(req.body);

        const plan = await PremiumPlan.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói' });
        }

        return res.status(200).json({ success: true, plan: toPlanResponse(plan) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật gói premium', error: error.message });
    }
};

export const deletePremiumPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await PremiumPlan.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói' });
        }

        return res.status(200).json({ success: true, message: 'Đã xóa gói premium' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi xóa gói premium', error: error.message });
    }
};

export const getAdminCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        return res.status(200).json({ success: true, coupons: coupons.map(toCouponResponse) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy danh sách mã giảm giá', error: error.message });
    }
};

export const createCoupon = async (req, res) => {
    try {
        const payload = buildCouponPayload(req.body);
        if (!payload.code || !payload.title || Number.isNaN(payload.discountValue)) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu mã giảm giá' });
        }

        const coupon = await Coupon.create(payload);
        return res.status(201).json({ success: true, coupon: toCouponResponse(coupon) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi tạo mã giảm giá', error: error.message });
    }
};

export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = buildCouponPayload(req.body);

        const coupon = await Coupon.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mã giảm giá' });
        }

        return res.status(200).json({ success: true, coupon: toCouponResponse(coupon) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật mã giảm giá', error: error.message });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Coupon.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mã giảm giá' });
        }

        return res.status(200).json({ success: true, message: 'Đã xóa mã giảm giá' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi xóa mã giảm giá', error: error.message });
    }
};

// ===================== ADMIN — PREMIUM USERS =====================

const toUserPremiumResponse = (user) => {
    // Tính lại isPremium dựa trên premiumExpiresAt thực tế
    const now = new Date();
    const isActuallyPremium = user.isPremium &&
        user.premiumExpiresAt != null &&
        new Date(user.premiumExpiresAt) > now;

    return {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar || '',
        isPremium: isActuallyPremium,
        isExpired: user.isPremium && user.premiumExpiresAt != null && new Date(user.premiumExpiresAt) <= now,
        premiumPlanCode: user.premiumPlanCode || null,
        premiumGrantedAt: user.premiumGrantedAt || null,
        premiumExpiresAt: user.premiumExpiresAt || null,
        createdAt: user.createdAt,
    };
};

export const getAdminPremiumUsers = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 50, filter = 'all' } = req.query;

        // Tự động cập nhật isPremium = false cho các user đã hết hạn trong DB
        await User.updateMany(
            { isPremium: true, premiumExpiresAt: { $lte: new Date() } },
            { $set: { isPremium: false } }
        );

        const query = {};
        if (filter === 'active') {
            query.isPremium = true;
            query.premiumExpiresAt = { $gt: new Date() };
        } else if (filter === 'expired') {
            // Đã hết hạn: isPremium = false nhưng có premiumExpiresAt trong quá khứ
            query.isPremium = false;
            query.premiumExpiresAt = { $lte: new Date(), $ne: null };
        } else if (filter === 'premium') {
            query.isPremium = true;
        }

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [users, total] = await Promise.all([
            User.find(query).sort({ premiumGrantedAt: -1, createdAt: -1 }).skip(skip).limit(Number(limit)),
            User.countDocuments(query),
        ]);

        return res.status(200).json({
            success: true,
            users: users.map(toUserPremiumResponse),
            total,
            page: Number(page),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy danh sách user premium', error: error.message });
    }
};

export const grantPremium = async (req, res) => {
    try {
        const { id } = req.params;
        const { planCode, durationDays, customExpiresAt, startDateMode = 'extend' } = req.body;

        // Bắt buộc phải truyền planCode từ Frontend
        if (!planCode) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã gói Premium hợp lệ (planCode)' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        }

        let expiresAt;

        if (customExpiresAt) {
            expiresAt = new Date(customExpiresAt);
            if (Number.isNaN(expiresAt.getTime())) {
                return res.status(400).json({ success: false, message: 'Ngày hết hạn không hợp lệ' });
            }
            if (expiresAt <= new Date()) {
                return res.status(400).json({ success: false, message: 'Ngày hết hạn không được nằm trong quá khứ' });
            }
        } else {
            if (!durationDays || Number(durationDays) <= 0) {
                return res.status(400).json({ success: false, message: 'Thiếu số ngày gia hạn' });
            }

            // Nếu startDateMode === 'extend' và còn hạn, gia hạn từ ngày hết hạn cũ; nếu không thì tính từ hôm nay
            const baseDate = (startDateMode === 'extend' && user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > new Date())
                ? user.premiumExpiresAt
                : new Date();

            expiresAt = new Date(baseDate);
            expiresAt.setDate(expiresAt.getDate() + Number(durationDays));
        }

        const updated = await User.findByIdAndUpdate(
            id,
            {
                isPremium: true,
                premiumExpiresAt: expiresAt,
                premiumPlanCode: planCode,
                premiumGrantedAt: new Date(),
            },
            { new: true }
        );

        // Gửi Socket event real-time đến user
        try {
            const io = getIO();
            const expiresAtFormatted = expiresAt.toLocaleDateString('vi-VN');
            io.to(`user:${id}`).emit('premium:activated', {
                isPremium: true,
                premiumExpiresAt: expiresAt.toISOString(),
                premiumPlanCode: planCode,
                source: 'admin_grant',
                message: `Admin đã cấp Premium cho bạn! Hiệu lực đến ${expiresAtFormatted}.`,
            });
        } catch (socketErr) {
            console.warn('[Socket] Không thể emit premium:activated (admin grant):', socketErr.message);
        }

        // Gửi FCM Push
        sendPushNotification(id, {
            title: '👑 Bạn đã được cấp Premium!',
            body: `Admin đã cấp gói ${planCode} cho bạn. Hiệu lực đến ${expiresAt.toLocaleDateString('vi-VN')}.`,
            data: {
                type: 'premiumActivated',
                planCode: planCode || '',
                premiumExpiresAt: expiresAt.toISOString(),
                source: 'admin_grant',
            },
        });

        return res.status(200).json({ success: true, user: toUserPremiumResponse(updated) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi cấp premium', error: error.message });
    }
};

export const revokePremium = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        }

        const updated = await User.findByIdAndUpdate(
            id,
            {
                isPremium: false,
                premiumExpiresAt: null,
                premiumPlanCode: null,
                premiumGrantedAt: null,
            },
            { new: true }
        );

        return res.status(200).json({ success: true, user: toUserPremiumResponse(updated) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi thu hồi premium', error: error.message });
    }
};

// ===================== ADMIN — TRANSACTIONS =====================

// Thống kê tổng hợp từ TOÀN BỘ DB (không bị giới hạn bởi limit phân trang)
export const getTransactionStats = async (req, res) => {
    try {
        const [revenueResult, counts] = await Promise.all([
            // Tổng doanh thu từ tất cả giao dịch thành công
            Transaction.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$finalAmount' } } },
            ]),
            // Đếm theo từng status
            Transaction.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
        ]);

        const totalRevenue = revenueResult[0]?.total ?? 0;
        const countMap = {};
        for (const c of counts) countMap[c._id] = c.count;

        return res.status(200).json({
            success: true,
            stats: {
                totalRevenue,
                successCount:   countMap['success']   ?? 0,
                pendingCount:   countMap['pending']   ?? 0,
                failedCount:    countMap['failed']    ?? 0,
                cancelledCount: countMap['cancelled'] ?? 0,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy thống kê giao dịch', error: error.message });
    }
};

export const getAdminTransactions = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 50, status = '' } = req.query;

        const query = {};
        if (status) query.status = status;
        if (search) {
            const users = await User.find({
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            }).select('_id');
            const userIds = users.map((u) => u._id);
            query.$or = [
                { userId: { $in: userIds } },
                { orderId: { $regex: search, $options: 'i' } },
                { planCode: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .populate('userId', 'username email avatar')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Transaction.countDocuments(query),
        ]);

        return res.status(200).json({ success: true, transactions, total, page: Number(page) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy lịch sử giao dịch', error: error.message });
    }
};