import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['user', 'admin'], 
        default: 'user' 
    },
    avatar: { type: String, default: "" },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    
    // Quan hệ
    likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    followedArtists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }],
    savedPlaylists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }]
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
export default User;