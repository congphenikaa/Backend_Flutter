import mongoose from 'mongoose';

const pendingSongSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    audioUrl: { type: String, required: true },
    imageUrl: { type: String, required: true },
    duration: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending_review'],
        default: 'pending_review'
    },
    riskLevel: {
        type: String,
        enum: ['MEDIUM'],
        default: 'MEDIUM'
    },
    aiSimilarityScore: { type: Number, default: 0 },
    aiMatchedSong: { type: String, default: null },
    aiMatches: [{
        start: { type: Number, required: true },
        end: { type: Number, required: true },
        score: { type: Number, required: true }
    }],
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    sourceSongId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceReason: { type: String, default: 'AI medium risk pending review' }
}, { timestamps: true });

pendingSongSchema.index({ title: 'text' });
pendingSongSchema.index({ createdAt: -1, status: 1 });

const PendingSong = mongoose.model('PendingSong', pendingSongSchema);

export default PendingSong;