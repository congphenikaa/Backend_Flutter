import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, unique: true },
    transId: { type: String, default: null },          // MoMo transaction ID
    planCode: { type: String, required: true },
    planName: { type: String, required: true },
    durationDays: { type: Number, required: true },
    originalAmount: { type: Number, required: true },   // Giá trước giảm
    discountAmount: { type: Number, default: 0 },       // Số tiền giảm
    finalAmount: { type: Number, required: true },      // Số tiền thực trả
    couponCode: { type: String, default: null },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'cancelled'],
        default: 'pending',
    },
    paymentMethod: { type: String, default: 'momo' },
    premiumExpiresAt: { type: Date, default: null },    // Ngày hết hạn sau giao dịch này
    ipnReceivedAt: { type: Date, default: null },
    note: { type: String, default: '' },
}, { timestamps: true });

transactionSchema.index({ createdAt: -1, status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
