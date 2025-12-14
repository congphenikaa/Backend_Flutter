import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    bio: { type: String, default: "" },
    followersCount: { type: Number, default: 0 } 
}, { timestamps: true });

const Artist = mongoose.model("Artist", artistSchema);
export default Artist;