import mongoose from "mongoose";

const playlistSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    image: { 
        type: String, 
        default: "https://phunugioi.com/wp-content/uploads/2022/03/Nhung-hinh-anh-dep-ve-am-nhac.jpg" 
    },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }]
}, { timestamps: true });

// Kiểm tra xem model đã tồn tại chưa để tránh lỗi OverwriteModelError khi hot-reload
const Playlist = mongoose.models.Playlist || mongoose.model('Playlist', playlistSchema);

export default Playlist;