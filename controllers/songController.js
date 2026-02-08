import Song from '../models/Songs.js';
import Album from '../models/Album.js';
import Artist from '../models/Artist.js';
import Fuse from 'fuse.js';
import {v2 as cloudinary} from 'cloudinary';

// 1. THÊM BÀI HÁT
const addSong = async (req, res) => {
    try {
        const title = req.body.title; 
        const description = req.body.description; 
        const duration = req.body.duration;
        const album = req.body.album;
        const artist = req.body.artist; 
        const category = req.body.category; 

        const audioFile = req.files.audio ? req.files.audio[0] : null;
        const imageFile = req.files.image ? req.files.image[0] : null;

        // Validation
        if (!title || !description || !artist || !duration || !audioFile || !imageFile) {
            // Rollback: Xóa file rác nếu thiếu dữ liệu text
            if(audioFile) await cloudinary.uploader.destroy(audioFile.filename, {resource_type: 'video'});
            if(imageFile) await cloudinary.uploader.destroy(imageFile.filename, {resource_type: 'image'});
            
            return res.json({ success: false, message: "Vui lòng nhập đầy đủ thông tin (Tên, Mô tả, Nghệ sĩ, File...)" });
        }

        const newSong = new Song({
            title,
            description,
            artist,
            duration,
            album: album && album !== "none" ? album : undefined,
            category: category ? category : [],
            // Lưu URL từ Cloudinary
            imageUrl: imageFile.path, 
            audioUrl: audioFile.path,  
        });

        await newSong.save();
        res.json({ success: true, message: "Đã thêm bài hát thành công!" });

    } catch (error) {
        console.log(error);
        // Rollback lỗi hệ thống
        if (req.files) {
            if (req.files.audio) await cloudinary.uploader.destroy(req.files.audio[0].filename, {resource_type: 'video'});
            if (req.files.image) await cloudinary.uploader.destroy(req.files.image[0].filename, {resource_type: 'image'});
        }
        res.json({ success: false, message: "Lỗi hệ thống khi thêm bài hát" });
    }
}

// 2. DANH SÁCH BÀI HÁT (Có Populate)
const listSong = async (req, res) => {
    try {
        // Populate giúp lấy info chi tiết của Artist, Album, Category
        const allSongs = await Song.find({})
            .populate("artist") 
            .populate("album")
            .populate("category");
            
        res.json({ success: true, songs: allSongs });
    } catch (error) {
        res.json({ success: false, message: "Lỗi lấy danh sách bài hát" });
    }
}

// 3. XÓA BÀI HÁT
const removeSong = async (req, res) => {
    try {
        const song = await Song.findById(req.body.id);
        if (!song) {
            return res.json({ success: false, message: "Không tìm thấy bài hát" });
        }

        // Hàm tiện ích lấy public_id từ URL Cloudinary
        // URL ví dụ: .../upload/v1234/folder/filename.jpg -> folder/filename
        const getPublicId = (url) => {
            if (!url) return null;
            const segments = url.split('/');
            // Lấy 2 phần cuối (folder/filename.ext)
            const lastPart = segments.pop(); // filename.ext
            const folderPart = segments.pop(); // folder
            const filename = lastPart.split('.')[0];
            return `${folderPart}/${filename}`;
        };

        // Xóa ảnh cũ
        if (song.imageUrl) {
            try {
                // Cách xóa đơn giản nếu bạn không chắc về cấu trúc folder
                // Nếu bạn dùng Multer-Storage-Cloudinary, req.file.filename chính là public_id chuẩn nhất
                // Nhưng ở đây ta lấy từ DB url nên cần parse
                const imagePublicId = getPublicId(song.imageUrl); 
                await cloudinary.uploader.destroy(imagePublicId, { resource_type: "image" });
            } catch (err) { console.log("Lỗi xóa ảnh cũ:", err); }
        }

        // Xóa nhạc cũ
        if (song.audioUrl) {
            try {
                const audioPublicId = getPublicId(song.audioUrl);
                await cloudinary.uploader.destroy(audioPublicId, { resource_type: "video" });
            } catch (err) { console.log("Lỗi xóa nhạc cũ:", err); }
        }

        await Song.findByIdAndDelete(req.body.id);
        res.json({ success: true, message: "Đã xóa bài hát thành công" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi xóa bài hát" });
    }
}

// 4. CẬP NHẬT BÀI HÁT (UPDATE)
const updateSong = async (req, res) => {
    try {
        const { id, title, description, artist, album, category, duration } = req.body;
        
        const song = await Song.findById(id);
        if (!song) return res.json({ success: false, message: "Không tìm thấy bài hát" });

        // Cập nhật Metadata
        song.title = title;
        song.description = description;
        song.artist = artist;
        song.album = album && album !== "none" ? album : null;
        song.category = category ? category : song.category;
        if (duration) song.duration = duration;

        // Xử lý File Ảnh mới (nếu có)
        if (req.files && req.files.image) {
            // 1. Xóa ảnh cũ
            if (song.imageUrl) {
                const oldImgId = song.imageUrl.split('/').pop().split('.')[0]; 
                await cloudinary.uploader.destroy(oldImgId); 
                // Lưu ý: Nếu có folder, dùng logic getPublicId như hàm removeSong
            }
            // 2. Gán ảnh mới
            song.imageUrl = req.files.image[0].path;
        }

        // Xử lý File Nhạc mới (nếu có)
        if (req.files && req.files.audio) {
            // 1. Xóa nhạc cũ
            if (song.audioUrl) {
                const oldAudioId = song.audioUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(oldAudioId, { resource_type: "video" });
            }
            // 2. Gán nhạc mới
            song.audioUrl = req.files.audio[0].path;
        }

        await song.save();
        res.json({ success: true, message: "Cập nhật bài hát thành công" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi khi cập nhật bài hát" });
    }
}

const listSongByCategory = async (req, res) => {
    try {
        const { id } = req.params; // Lấy ID từ URL
        const songs = await Song.find({ category: id })
            .populate("artist");
        res.json({ success: true, songs: songs });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error fetching songs by category" });
    }
}

// 1. LẤY BÀI HÁT THEO ALBUM ID
const listSongByAlbum = async (req, res) => {
    try {
        const { id } = req.params;
        // Tìm bài hát có field 'album' trùng với id gửi lên
        const songs = await Song.find({ album: id });
        res.json({ success: true, songs: songs });
    } catch (error) {
        res.json({ success: false, message: "Error" });
    }
}

// --- THUẬT TOÁN TÌM KIẾM (FUZZY SEARCH) ---
const searchGlobal = async (req, res) => {
    try {
        const { query } = req.query; 
        
        // 1. Kiểm tra đầu vào
        if (!query || query.trim().length === 0) {
            return res.json({ success: true, songs: [], artists: [], albums: [] });
        }

        // 2. Lấy dữ liệu thô từ Database (Chỉ lấy các trường cần thiết để tối ưu RAM)
        // Dùng Promise.all để chạy song song 3 câu lệnh query
        const [allSongs, allArtists, allAlbums] = await Promise.all([
            Song.find({}).populate('artist').populate('album'),
            Artist.find({}),
            Album.find({}).populate('artist')
        ]);

        // 3. Cấu hình thuật toán Fuse.js
        // threshold: 0.0 (chính xác tuyệt đối) -> 1.0 (chấp nhận tất cả). 0.4 là mức lý tưởng cho việc gõ sai nhẹ.
        const options = {
            includeScore: true,
            threshold: 0.4, 
            ignoreLocation: true, // Tìm thấy ở bất kỳ vị trí nào trong chuỗi
            useExtendedSearch: true
        };

        // --- A. TÌM BÀI HÁT ---
        // Logic: Ưu tiên tìm trong 'title' (trọng số cao), sau đó tìm trong 'artist.name'
        const songFuse = new Fuse(allSongs, {
            ...options,
            keys: [
                { name: 'title', weight: 0.6 },        // Tên bài hát quan trọng nhất
                { name: 'artist.name', weight: 0.4 }   // Tên ca sĩ cũng quan trọng
            ]
        });
        const songResults = songFuse.search(query).map(res => res.item).slice(0, 10); // Lấy 10 kết quả

        // --- B. TÌM NGHỆ SĨ ---
        const artistFuse = new Fuse(allArtists, {
            ...options,
            keys: ['name']
        });
        const artistResults = artistFuse.search(query).map(res => res.item).slice(0, 5);

        // --- C. TÌM ALBUM ---
        const albumFuse = new Fuse(allAlbums, {
            ...options,
            keys: ['title', 'artist.name']
        });
        const albumResults = albumFuse.search(query).map(res => res.item).slice(0, 5);

        // 4. Trả kết quả về cho Flutter
        res.json({ 
            success: true, 
            songs: songResults, 
            artists: artistResults, 
            albums: albumResults 
        });

    } catch (error) {
        console.error("Search Error:", error);
        res.json({ success: false, message: "Lỗi tìm kiếm server" });
    }
}

// --- TĂNG LƯỢT NGHE (Plays) ---
const incrementPlays = async (req, res) => {
    try {
        const { id } = req.body; // Nhận ID bài hát từ body

        // Sử dụng $inc để tăng 1 đơn vị, đảm bảo an toàn khi nhiều user gọi cùng lúc
        await Song.findByIdAndUpdate(id, { $inc: { plays: 1 } });

        res.json({ success: true, message: "Plays incremented" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error incrementing plays" });
    }
}

export { addSong, listSong, removeSong, updateSong, 
    listSongByCategory, listSongByAlbum, searchGlobal, incrementPlays };