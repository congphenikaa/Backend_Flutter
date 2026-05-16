import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { 
        type: String, 
        required: false,           
        select: false              
    },
    role: { 
        type: String, 
        enum: ['user', 'artist', 'admin'], 
        default: 'user' 
    },
    avatar: { type: String, default: "" },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    googleId: { type: String, default: null },
    authProvider: { 
        type: String, 
        enum: ['local', 'google'], 
        default: 'local' 
    },
    
    // Quan hệ
    likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    followedArtists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }],
    savedPlaylists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }]
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
export default User;