import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, required: true },
    releaseDate: { type: Date, default: Date.now },
    
    // Quan hệ
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }] 
}, { timestamps: true });

const Album = mongoose.model("Album", albumSchema);
export default Album;