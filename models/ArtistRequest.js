import mongoose from 'mongoose';

const artistRequestSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stageName: { type: String, required: true },
    socialLink: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

const ArtistRequest = mongoose.model('ArtistRequest', artistRequestSchema);
export default ArtistRequest;
