import { v2 as cloudinary } from 'cloudinary';
import Playlist from '../models/Playlist.js';

// 1. Tạo Playlist cá nhân
const createPlaylist = async (req, res) => {
    try {
        const { name, desc, userId } = req.body;
        
        let imageUrl = "https://i.scdn.co/image/ab67616d0000b2735f3ddebf1972750d8924b4df"; // Ảnh mặc định
        
        // Nếu có upload ảnh
        if (req.file) {
            const imageUpload = await cloudinary.uploader.upload(req.file.path, { resource_type: "image" });
            imageUrl = imageUpload.secure_url;
        }

        const playlist = new Playlist({
            name,
            description: desc,
            image: imageUrl,
            creator: userId,
            songs: []
        });

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
        const playlists = await Playlist.find({ creator: userId });
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
        const { playlistId } = req.body; // Expecting playlistId in body, or req.body.id depending on your frontend
        // Để an toàn, check cả 2 trường hợp id hoặc playlistId
        const idToDelete = playlistId || req.body.id;
        
        await Playlist.findByIdAndDelete(idToDelete);
        res.json({ success: true, message: "Playlist removed" });
    } catch (error) {
        res.json({ success: false, message: "Error removing playlist" });
    }
}

// 5. Lấy chi tiết Playlist (kèm bài hát) - Dùng khi bấm vào playlist để xem list nhạc
const getPlaylistById = async (req, res) => {
    try {
        const { id } = req.params;
        const playlist = await Playlist.findById(id).populate('songs');
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