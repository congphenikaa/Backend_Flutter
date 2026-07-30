import mongoose from 'mongoose';

const copyrightStrikeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    audioUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    riskLevel: {
        type: String,
        enum: ['HIGH'],
        default: 'HIGH'
    },
    aiSimilarityScore: { type: Number, default: 0 },
    aiMatchedSong: { type: String, default: null },
    aiMatches: [{
        start: { type: Number, required: true },
        end: { type: Number, required: true },
        score: { type: Number, required: true }
    }],
    sourceSongId: { type: mongoose.Schema.Types.ObjectId, default: null },
    strikeReason: { type: String, default: '' },
    strikeCountedAt: { type: Date, default: Date.now }
}, { timestamps: true });

copyrightStrikeSchema.index({ title: 'text' });

const CopyrightStrike = mongoose.model('CopyrightStrike', copyrightStrikeSchema);

export default CopyrightStrike;