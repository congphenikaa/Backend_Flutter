import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
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

    // Premium
    isActive: { type: Boolean, default: true, index: true },
    isPremium: { type: Boolean, default: false },
    premiumExpiresAt: { type: Date, default: null },
    premiumPlanCode: { type: String, default: null },
    premiumGrantedAt: { type: Date, default: null },
    
    // Quan hệ
    likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    followedArtists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }],
    savedPlaylists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }],

    // Push Notification — FCM token do Flutter gửi lên sau khi login
    fcmToken: { type: String, default: null },

    // Forgot Password
    resetOTP: { type: String, default: null },
    resetOTPExpiry: { type: Date, default: null },
}, { timestamps: true });

userSchema.index({ createdAt: -1 });

const User = mongoose.model("User", userSchema);
export default User;