import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema({
    // LIÊN KẾT TÀI KHOẢN ĐĂNG NHẬP VỚI HỒ SƠ NGHỆ SĨ
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    bio: { type: String, default: "" },
    followersCount: { type: Number, default: 0 },
    
    // Dành cho Admin cấp Tích xanh
    isVerified: { type: Boolean, default: false } 
}, { 
    timestamps: true,
    toJSON: { virtuals: true }, 
    toObject: { virtuals: true }
});

// Virtual: Tìm tất cả Album mà field 'artist' trùng với _id của Artist này
artistSchema.virtual('albums', {
    ref: 'Album',
    localField: '_id',
    foreignField: 'artist'
});

// Virtual: Tìm tất cả Song mà field 'artist' trùng với _id của Artist này
artistSchema.virtual('songs', {
    ref: 'Song',
    localField: '_id',
    foreignField: 'artist'
});

const Artist = mongoose.model("Artist", artistSchema);
export default Artist;