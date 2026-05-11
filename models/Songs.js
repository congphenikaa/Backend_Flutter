import mongoose from 'mongoose';

const songSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    audioUrl: { type: String, required: true }, 
    imageUrl: { type: String, required: true }, 
    duration: { type: Number, required: true }, 
    
    // --- CÁC TRƯỜNG DÀNH CHO AI & KIỂM DUYỆT ---
    status: { 
        type: String, 
        enum: ['draft', 'pending_ai', 'flagged', 'live', 'rejected'], 
        default: 'pending_ai' // Mặc định khi Artist upload là phải chờ AI
    },
    aiSimilarityScore: { type: Number, default: 0 }, // Lưu % đạo nhạc
    aiMatchedSong: { type: String, default: null },  // Lưu tên bài hát gốc nếu bị trùng
    // -------------------------------------------

    // Quan hệ
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' }, 
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    
    plays: { type: Number, default: 0 },
}, { timestamps: true });

// Tạo index tìm kiếm
songSchema.index({ title: 'text' });

const Song = mongoose.model("Song", songSchema);
export default Song;