import mongoose from 'mongoose';

const songSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    audioUrl: { type: String, required: true }, // Link mp3 Cloudinary
    imageUrl: { type: String, required: true }, // Ảnh bìa
    duration: { type: Number, required: true }, // Giây
    
    // Quan hệ
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist'},
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' }, 
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    
    plays: { type: Number, default: 0 },
}, { timestamps: true });

// Tạo index tìm kiếm
songSchema.index({ title: 'text' });

const Song = mongoose.model("Song", songSchema);
export default Song;