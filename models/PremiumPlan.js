import mongoose from 'mongoose';

const premiumPlanSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null, min: 0 },
    badgeText: { type: String, default: '' },
    durationDays: { type: Number, required: true, min: 1 },
    features: [{ type: String, trim: true }],
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    // ── Room tier — Virtual Music Room ───────────────────────────────
    // Số Listener tối đa được phép vào phòng (không tính Host)
    // Free (không có plan): 2 — hard-coded trong roomHandler.js
    maxRoomListeners:   { type: Number, default: 2 },
    // Có cấp trải nghiệm VIP (không quảng cáo) cho Free Listener không
    allowFreeListeners: { type: Boolean, default: true },

    // ── Group Chat ──────────────────────────────────────────────────
    // Số thành viên tối đa trong một nhóm cộng đồng
    maxGroupMembers:    { type: Number, default: 5 },
}, { timestamps: true });

const PremiumPlan = mongoose.model('PremiumPlan', premiumPlanSchema);

export default PremiumPlan;