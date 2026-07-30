import mongoose from 'mongoose';

const advertisementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    advertiserName: { type: String, required: true },
    audioUrl: { type: String }, // Bắt buộc nếu type = audio | rewarded
    bannerImageUrl: { type: String, required: true },
    clickUrl: { type: String },
    type: { 
        type: String, 
        enum: ['audio', 'banner', 'rewarded'], 
        default: 'audio' 
    },
    durationSeconds: { type: Number, default: 15 },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 1 }, // Trọng số để random: càng cao xác suất xuất hiện càng lớn
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date }, // Null = không bao giờ hết hạn
    playCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
}, { timestamps: true });

const Advertisement = mongoose.model("Advertisement", advertisementSchema);
export default Advertisement;
