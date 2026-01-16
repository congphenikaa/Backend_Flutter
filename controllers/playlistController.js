import { v2 as cloudinary } from 'cloudinary';
import Playlist from '../models/Playlist.js';

// 1. Tạo Playlist cá nhân
const createPlaylist = async (req, res) => {
    try {
        const { name, desc, userId } = req.body;
        
        let imageUrl;

        // URL ảnh mặc định (Khớp với Model của bạn để đảm bảo tính nhất quán)
        const defaultImage = "https://phunugioi.com/wp-content/uploads/2022/03/Nhung-hinh-anh-dep-ve-am-nhac.jpg";

        if (req.file) {
            // Trường hợp 1: User có upload ảnh -> Upload ảnh đó
            const imageUpload = await cloudinary.uploader.upload(req.file.path, { 
                resource_type: "image",
                folder: "music_app_playlists"
            });
            imageUrl = imageUpload.secure_url;
        } else {
            // Trường hợp 2: User KHÔNG upload ảnh 
            // -> Upload ảnh mặc định lên Cloudinary để lấy link Cloudinary lưu vào DB
            const imageUpload = await cloudinary.uploader.upload(defaultImage, { 
                resource_type: "image",
                folder: "music_app_playlists"
            });
            imageUrl = imageUpload.secure_url;
        }

        const playlistData = {
            name,
            description: desc,
            image: imageUrl, 
            creator: userId,
            songs: []
        };

        const playlist = new Playlist(playlistData);
        await playlist.save();
        
        res.json({ success: true, message: "Playlist created successfully", playlist });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error creating playlist" });
    }
}

// 2. Lấy danh sách Playlist của User
const getUserPlaylists = async (req, res) => {
    try {
        const { userId } = req.body;
        // Sắp xếp giảm dần theo thời gian tạo để thấy playlist mới nhất lên đầu
        const playlists = await Playlist.find({ creator: userId }).sort({ createdAt: -1 });
        res.json({ success: true, playlists });
    } catch (error) {
        res.json({ success: false, message: "Error fetching playlists" });
    }
}

// 3. Thêm bài hát vào Playlist
const addSongToPlaylist = async (req, res) => {
    try {
        const { playlistId, songId } = req.body;
        const playlist = await Playlist.findById(playlistId);
        
        if (!playlist) return res.json({ success: false, message: "Playlist not found" });
        
        if (playlist.songs.includes(songId)) {
            return res.json({ success: false, message: "Song already in playlist" });
        }

        playlist.songs.push(songId);
        await playlist.save();
        res.json({ success: true, message: "Song added to playlist" });

    } catch (error) {
        res.json({ success: false, message: "Error adding song" });
    }
}

// 4. Xóa Playlist
const removePlaylist = async (req, res) => {
    try {
        const { playlistId } = req.body; 
        const idToDelete = playlistId || req.body.id;
        
        await Playlist.findByIdAndDelete(idToDelete);
        res.json({ success: true, message: "Playlist removed" });
    } catch (error) {
        res.json({ success: false, message: "Error removing playlist" });
    }
}

// 5. Lấy chi tiết Playlist (kèm bài hát)
const getPlaylistById = async (req, res) => {
    try {
        const { id } = req.params;
        const playlist = await Playlist.findById(id)
            .populate('creator', 'name avatar') 
            .populate('songs')
            .lean(); 

        if (!playlist) return res.json({ success: false, message: "Playlist not found" });

        res.json({ success: true, playlist });
    } catch (error) {
        res.json({ success: false, message: "Error fetching playlist details" });
    }
}

export { 
    createPlaylist, 
    getUserPlaylists, 
    addSongToPlaylist, 
    removePlaylist,
    getPlaylistById,
};