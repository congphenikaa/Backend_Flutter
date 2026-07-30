import mongoose from 'mongoose';

const songSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    audioUrl: { type: String, required: true }, 
    imageUrl: { type: String, required: true }, 
    duration: { type: Number, required: true }, 
    
    // Song chỉ giữ nội dung đã sẵn sàng phát hành.
    status: {
        type: String,
        enum: ['live'],
        default: 'live'
    },
    aiSimilarityScore: { type: Number, default: 0 },
    aiMatchedSong: { type: String, default: null },

    // Quan hệ
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' }, 
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    
    plays: { type: Number, default: 0 },
}, { timestamps: true });

// Tạo index tìm kiếm
songSchema.index({ title: 'text' });
songSchema.index({ createdAt: -1, status: 1 });

const Song = mongoose.model("Song", songSchema);
export default Song;