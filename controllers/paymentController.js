import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import PremiumPlan from '../models/PremiumPlan.js';
import Transaction from '../models/Transaction.js';
import { getIO } from '../sockets/index.js';
import { sendPushNotification } from '../utils/fcmHelper.js';

const normalizeCouponCode = (code) => (code || '').trim().toUpperCase();


const resolveCouponDiscount = async (couponCode, amount) => {
    if (!couponCode) return { finalAmount: amount, discountAmount: 0, coupon: null };

    const coupon = await Coupon.findOne({ code: normalizeCouponCode(couponCode), isActive: true });
    if (!coupon) return { finalAmount: amount, discountAmount: 0, coupon: null };

    const now = new Date();
    if ((coupon.startDate && coupon.startDate > now) || (coupon.endDate && coupon.endDate < now))
        return { finalAmount: amount, discountAmount: 0, coupon: null };

    if (coupon.minimumAmount && amount < coupon.minimumAmount)
        return { finalAmount: amount, discountAmount: 0, coupon: null };

    if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit)
        return { finalAmount: amount, discountAmount: 0, coupon: null };

    let discountAmount = coupon.discountType === 'fixed'
        ? coupon.discountValue
        : amount * (coupon.discountValue / 100);

    if (coupon.maxDiscountAmount) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);

    return { finalAmount: Math.max(0, amount - discountAmount), discountAmount, coupon };
};

// Hàm tạo order MoMo và ghi transaction pending
export const createMoMoPayment = async (req, res) => {
    try {
        const { amount, planName, planCode, userId, couponCode } = req.body;

        if (!userId) return res.status(400).json({ success: false, message: 'Thiếu userId' });

        // Lấy plan
        let durationDays = 30;
        if (planCode) {
            const plan = await PremiumPlan.findOne({ code: planCode, isActive: true });
            if (plan) durationDays = plan.durationDays;
        }

        const originalAmount = parseFloat(amount);
        let finalAmount = originalAmount;
        let resolvedDiscountAmount = 0;
        let appliedCoupon = null;
        let discountInfo = '';

        const couponResult = await resolveCouponDiscount(couponCode, finalAmount);
        if (couponResult.coupon) {
            finalAmount = couponResult.finalAmount;
            resolvedDiscountAmount = couponResult.discountAmount;
            appliedCoupon = couponResult.coupon;
            discountInfo = ` (Đã áp dụng mã ${couponResult.coupon.code})`;
        }

        const baseUrl = process.env.BASE_URL;

        const partnerCode = 'MOMO';
        const accessKey = 'F8BBA842ECF85';
        const secretkey = 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
        const requestId = partnerCode + new Date().getTime();
        const orderId = requestId;
        const orderInfo = `Thanh toán gói nhạc ${planName}${discountInfo}`;
        const redirectUrl = `${baseUrl}/api/payment/success`;
        const ipnUrl = `${baseUrl}/api/payment/momo-ipn`;
        const requestType = 'payWithMethod';
        const extraData = '';
        const partnerName = 'Test';
        const storeId = 'MomoTestStore';
        const autoCapture = true;
        const orderGroupId = '';

        // Signature chuẩn 10 field — KHÔNG có paymentCode
        const rawSignature =
            'accessKey=' + accessKey +
            '&amount=' + finalAmount +
            '&extraData=' + extraData +
            '&ipnUrl=' + ipnUrl +
            '&orderId=' + orderId +
            '&orderInfo=' + orderInfo +
            '&partnerCode=' + partnerCode +
            '&redirectUrl=' + redirectUrl +
            '&requestId=' + requestId +
            '&requestType=' + requestType;

        const signature = crypto.createHmac('sha256', secretkey).update(rawSignature).digest('hex');

        // Body cũng KHÔNG có paymentCode — MoMo tự hiện trang chọn method
        const requestBody = {
            partnerCode, partnerName, storeId, accessKey,
            requestId, amount: finalAmount.toString(), orderId,
            orderInfo, redirectUrl, ipnUrl, lang: 'vi',
            autoCapture, extraData, requestType, orderGroupId,
            signature,
        };

        const response = await axios.post('https://test-payment.momo.vn/v2/gateway/api/create', requestBody, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.data && response.data.payUrl) {
            // Revert back to Transaction.create as requested by user
            await Transaction.create({
                userId, 
                orderId,
                planCode: planCode || 'unknown',
                planName, 
                durationDays,
                originalAmount, 
                discountAmount: resolvedDiscountAmount, 
                finalAmount,
                couponCode: appliedCoupon ? appliedCoupon.code : null,
                couponId: appliedCoupon ? appliedCoupon._id : null,
                status: 'pending',
                paymentMethod: 'momo',
            });

            console.log(`[MOMO CREATE] Order ${orderId} — user ${userId} — plan ${planCode} — ${durationDays}d — ${finalAmount}đ`);
            return res.status(200).json({ success: true, payUrl: response.data.payUrl, orderId });
        } else {
            return res.status(400).json({ success: false, message: 'MoMo không trả về payUrl', detail: response.data });
        }
    } catch (error) {
        console.error('Lỗi xử lý MoMo:', error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: 'Lỗi kết nối cổng thanh toán' });
    }
};

// Redirect từ MoMo → HTML tự mở deep link
export const paymentSuccess = async (req, res) => {
    try {
        const { orderId, resultCode, amount, transId, message } = req.query;
        console.log(`[REDIRECT] Order: ${orderId}, Result: ${resultCode}, TransID: ${transId}`);

        const deepLink = `appnghenhac://payment-success?orderId=${encodeURIComponent(orderId || '')}&transId=${encodeURIComponent(transId || '')}&resultCode=${encodeURIComponent(resultCode || '')}&amount=${encodeURIComponent(amount || '')}&message=${encodeURIComponent(message || '')}`;

        return res.status(200).send(`
            <!doctype html>
            <html lang="vi">
              <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>MoMo Payment</title></head>
              <body style="font-family:Arial,sans-serif;padding:24px;text-align:center;background:#111;color:#fff">
                <h3>Đang quay lại ứng dụng...</h3>
                <p>Nếu ứng dụng không tự mở, hãy bấm nút bên dưới.</p>
                <p><a href="${deepLink}" style="display:inline-block;padding:12px 24px;background:#1DB954;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Mở lại ứng dụng</a></p>
                <script>setTimeout(function(){window.location.href=${JSON.stringify(deepLink)};},300);</script>
              </body>
            </html>
        `);
    } catch (error) {
        return res.status(500).send('Lỗi xử lý thanh toán');
    }
};

export const momoIPN = async (req, res) => {
    const { 
        partnerCode, orderId, requestId, amount, orderInfo, orderType, transId, 
        resultCode, message, payType, responseTime, extraData, signature 
    } = req.body;
    
    console.log(`[IPN] Order: ${orderId}, Result: ${resultCode}, TransID: ${transId}`);

    // Xác thực Signature (Lỗ hổng bảo mật)
    const accessKey = 'F8BBA842ECF85';
    const secretkey = 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
    const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
    const expectedSignature = crypto.createHmac('sha256', secretkey).update(rawSignature).digest('hex');

    if (signature !== expectedSignature) {
        console.error(`[IPN] Lỗi chữ ký không khớp cho Order: ${orderId}`);
        return res.status(400).send('Invalid signature');
    }

    // Trả về 204 ngay cho MoMo
    res.status(204).send();

    // ─── Cập nhật transaction: chỉ update nếu đang pending ──────────────────
    let updatedTx = null;
    try {
        updatedTx = await Transaction.findOneAndUpdate(
            { orderId, status: 'pending' },
            {
                status: resultCode === 0 ? 'success' : 'failed',
                transId: transId || null,
                ipnReceivedAt: new Date(),
            },
            { new: true }
        );
        if (!updatedTx) {
            console.log(`[IPN] Transaction ${orderId} đã được xử lý hoặc không tồn tại.`);
            return;
        }
    } catch (e) {
        console.error('[IPN] Lỗi cập nhật transaction status:', e.message);
        return;
    }

    if (resultCode !== 0) {
        console.log(`[IPN FAILED] Order ${orderId} thất bại — mã: ${resultCode}`);
        return;
    }

    console.log(`[IPN SUCCESS] Order ${orderId} thành công. TransID: ${transId}`);

    try {
        const { userId, durationDays, planCode, couponId } = updatedTx;

        const user = await User.findById(userId);
        if (!user) { console.error(`[IPN] Không tìm thấy user: ${userId}`); return; }

        // Gia hạn từ ngày hết hạn hiện tại nếu còn premium
        const startDate = (user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > new Date())
            ? user.premiumExpiresAt : new Date();

        const expiresAt = new Date(startDate);
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        await User.findByIdAndUpdate(userId, {
            isPremium: true,
            premiumExpiresAt: expiresAt,
            premiumPlanCode: planCode,
            premiumGrantedAt: new Date(),
        });

        await Transaction.findOneAndUpdate({ orderId }, { premiumExpiresAt: expiresAt });

        if (couponId) {
            await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
        }

        // ★ Gửi Socket event real-time đến user
        try {
            const io = getIO();
            const expiresAtFormatted = expiresAt.toLocaleDateString('vi-VN');
            io.to(`user:${userId}`).emit('premium:activated', {
                isPremium: true,
                premiumExpiresAt: expiresAt.toISOString(),
                premiumPlanCode: planCode,
                source: 'payment', // phân biệt với admin grant
                message: `Thanh toán thành công! Premium hiệu lực đến ${expiresAtFormatted}.`,
            });
        } catch (socketErr) {
            console.warn('[Socket] Không thể emit premium:activated (IPN):', socketErr.message);
        }

        // ★ Gửi FCM Push (backup khi app bị tắt)
        sendPushNotification(userId, {
            title: '👑 Premium đã kích hoạt!',
            body: `Gói ${planCode} của bạn đã được kích hoạt thành công. Trải nghiệm không giới hạn ngay bây giờ!`,
            data: {
                type: 'premiumActivated',
                planCode: planCode || '',
                premiumExpiresAt: expiresAt.toISOString(),
                source: 'payment',
            },
        });

        console.log(`[IPN] Đã cập nhật premium user ${userId} — hết hạn: ${expiresAt.toISOString()}`);
    } catch (error) {
        console.error('[IPN] Lỗi cập nhật premium:', error.message);
    }
};

// Lấy lịch sử giao dịch (user tự xem)
export const getUserTransactions = async (req, res) => {
    try {
        const userId = req.user?._id?.toString() || req.user?.id?.toString();
        if (!userId) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });

        const transactions = await Transaction.find({ userId })
            .sort({ createdAt: -1 })
            .limit(30);

        return res.status(200).json({ success: true, transactions });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy lịch sử', error: error.message });
    }
};

// Check & expire premium khi login
export const checkAndExpirePremium = async (req, res) => {
    try {
        const userId = req.user?._id?.toString() || req.user?.id?.toString();
        if (!userId) return res.status(401).json({ success: false });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false });

        if (user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt < new Date()) {
            await User.findByIdAndUpdate(userId, { isPremium: false });
            console.log(`[EXPIRE] User ${userId} premium đã hết hạn`);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
};

// ─── Admin: Hủy giao dịch pending/failed ──────────────────────────────────────
// Chỉ cho phép cancel nếu status là pending hoặc failed (không phải success)
export const cancelPendingTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const tx = await Transaction.findById(transactionId);

        if (!tx) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
        }
        if (tx.status === 'success') {
            return res.status(400).json({ success: false, message: 'Không thể hủy giao dịch đã thành công' });
        }
        if (tx.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Giao dịch đã được hủy trước đó' });
        }

        await Transaction.findByIdAndUpdate(transactionId, {
            status: 'cancelled',
            note: `Admin hủy thủ công lúc ${new Date().toISOString()}`,
        });

        console.log(`[ADMIN] Đã hủy transaction ${tx.orderId} (trạng thái cũ: ${tx.status})`);
        return res.status(200).json({ success: true, message: 'Đã hủy giao dịch thành công' });
    } catch (error) {
        console.error('[ADMIN] Lỗi hủy transaction:', error.message);
        return res.status(500).json({ success: false, message: 'Lỗi hủy giao dịch', error: error.message });
    }
};

// ─── Admin: Xử lý thủ công — mark success + cấp premium ──────────────────────
// Dùng khi IPN bị mất, resultCode lỗi sandbox, hoặc admin xác nhận user đã trả tiền
export const adminResolveTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const tx = await Transaction.findById(transactionId);

        if (!tx) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
        }
        if (tx.status === 'success') {
            return res.status(400).json({ success: false, message: 'Giao dịch này đã thành công rồi' });
        }
        if (tx.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Giao dịch đã bị hủy, không thể resolve' });
        }

        // 1. Cập nhật transaction → success
        await Transaction.findByIdAndUpdate(transactionId, {
            status: 'success',
            ipnReceivedAt: tx.ipnReceivedAt || new Date(),
            note: `Admin xác nhận thủ công lúc ${new Date().toISOString()}`,
        });

        // 2. Cấp premium cho user (gia hạn từ ngày hết hạn hiện tại nếu còn hạn)
        const { userId, durationDays, planCode, couponId } = tx;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user trong giao dịch này' });
        }

        const startDate = (user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > new Date())
            ? user.premiumExpiresAt : new Date();

        const expiresAt = new Date(startDate);
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        await User.findByIdAndUpdate(userId, {
            isPremium: true,
            premiumExpiresAt: expiresAt,
            premiumPlanCode: planCode,
            premiumGrantedAt: new Date(),
        });

        await Transaction.findByIdAndUpdate(transactionId, { premiumExpiresAt: expiresAt });

        // 3. Tăng usedCount coupon nếu có (và chưa tăng trước đó — tránh double count)
        if (couponId) {
            await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
        }

        // 4. Gửi Socket event real-time đến user
        try {
            const io = getIO();
            const expiresAtFormatted = expiresAt.toLocaleDateString('vi-VN');
            io.to(`user:${userId}`).emit('premium:activated', {
                isPremium: true,
                premiumExpiresAt: expiresAt.toISOString(),
                premiumPlanCode: planCode,
                source: 'admin_resolve',
                message: `Admin đã xác nhận giao dịch! Premium hiệu lực đến ${expiresAtFormatted}.`,
            });
        } catch (socketErr) {
            console.warn('[Socket] Không thể emit premium:activated (admin resolve):', socketErr.message);
        }

        // 5. Gửi FCM Push
        sendPushNotification(userId, {
            title: '👑 Premium đã kích hoạt!',
            body: `Giao dịch của bạn đã được xác nhận. Gói ${planCode} hiệu lực đến ${expiresAt.toLocaleDateString('vi-VN')}.`,
            data: {
                type: 'premiumActivated',
                planCode: planCode || '',
                premiumExpiresAt: expiresAt.toISOString(),
                source: 'admin_resolve',
            },
        });

        console.log(`[ADMIN] Đã resolve thủ công transaction ${tx.orderId} — user ${userId} → premium đến ${expiresAt.toISOString()}`);
        return res.status(200).json({
            success: true,
            message: `Đã cấp Premium cho user đến ${expiresAt.toLocaleDateString('vi-VN')}`,
            premiumExpiresAt: expiresAt,
        });
    } catch (error) {
        console.error('[ADMIN] Lỗi resolve transaction:', error.message);
        return res.status(500).json({ success: false, message: 'Lỗi xử lý giao dịch', error: error.message });
    }
};