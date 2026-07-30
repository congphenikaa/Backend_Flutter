import mongoose from 'mongoose';

const artistRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    artistName: {
        type: String,
        required: true,
        trim: true
    },
    bio: {
        type: String,
        default: '',
        maxlength: 500
    },
    genre: [{
        type: String
    }],
    socialLinks: {
        instagram: { type: String, default: '' },
        youtube: { type: String, default: '' },
        tiktok: { type: String, default: '' },
        spotify: { type: String, default: '' }
    },
    reason: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    adminNote: {
        type: String,
        default: ''
    }
}, { timestamps: true });

artistRequestSchema.index({ status: 1 });

const ArtistRequest = mongoose.model('ArtistRequest', artistRequestSchema);
export default ArtistRequest;