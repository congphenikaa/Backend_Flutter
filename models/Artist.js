import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    bio: { type: String, default: "" },
    followersCount: { type: Number, default: 0 } 
}, { 
    timestamps: true,
    toJSON: { virtuals: true }, // Cho phép hiện virtual khi res.json()
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