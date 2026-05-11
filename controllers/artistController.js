import Artist from '../models/Artist.js';
import Album from '../models/Album.js';
import Song from '../models/Songs.js';
import {v2 as cloudinary} from 'cloudinary';
import axios from 'axios';
import FormData from 'form-data';
import streamifier from 'streamifier';

const addArtist = async (req, res) => {
    try {
        const name = req.body.name;
        const bio = req.body.bio;
        
        // Vì dùng multer-cloudinay nên req.file.path CHÍNH LÀ URL CLOUDINARY rồi
        const imageFile = req.file; 

        if (!name || !bio || !imageFile) {
            // ROLLBACK: Nếu thiếu tên mà ảnh đã lỡ lên Cloudinary rồi thì phải xóa
            if (imageFile) {
                await cloudinary.uploader.destroy(imageFile.filename);
            }
            return res.json({ success: false, message: "Vui lòng nhập đủ thông tin" });
        }

        const newArtist = new Artist({
            name: name,
            bio: bio,
            image: imageFile.path, // Lấy thẳng URL từ middleware
            followersCount: 0
        });

        await newArtist.save();
        res.json({ success: true, message: "Thêm nghệ sĩ thành công" });

    } catch (error) {
        // ROLLBACK khi lỗi DB
        if (req.file) {
            await cloudinary.uploader.destroy(req.file.filename);
        }
        res.json({ success: false, message: "Lỗi hệ thống" });
    }
}
const listArtist = async (req, res) => {
    try {

        const allArtists = await Artist.find({});
        res.json({success: true, artists: allArtists});
    }catch (error) {
        res.json({success: false, message: "Lỗi lấy danh sách nghệ sĩ"});
    }
}

const updateArtist = async (req, res) => {
    try {
        const { id, name, bio } = req.body;

        // 1. Tìm artist cần sửa
        const artist = await Artist.findById(id);
        if (!artist) {
            return res.json({ success: false, message: "Không tìm thấy nghệ sĩ" });
        }

        // Tìm xem có ai KHÁC (id khác id hiện tại) mà có cùng tên này không
        const existingName = await Artist.findOne({ name: name, _id: { $ne: id } });
        if (existingName) {
            return res.json({ success: false, message: "Tên nghệ sĩ này đã tồn tại, vui lòng chọn tên khác!" });
        }

        // Cập nhật thông tin text
        artist.name = name;
        artist.bio = bio;

        // --- [FIX LỖI 2]: XỬ LÝ ẢNH CŨ KHI CÓ ẢNH MỚI ---
        if (req.file) {
            // A. Xóa ảnh cũ trên Cloudinary
            if (artist.image) {
                try {
                    const imagePublicId = artist.image.split('/').slice(-2).join('/').split('.')[0];
                    await cloudinary.uploader.destroy(imagePublicId, {resource_type: "image"}); 
                } catch (err) {
                    console.log("Lỗi xóa ảnh cũ (không ảnh hưởng update):", err);
                }
            }

            // B. Upload ảnh mới
            const imageUpload = await cloudinary.uploader.upload(req.file.path, { resource_type: "image" });
            artist.image = imageUpload.secure_url;
        }

        await artist.save();
        res.json({ success: true, message: "Cập nhật thành công!" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi hệ thống khi cập nhật" });
    }
}

const removeArtist = async (req, res) => {
    try {

        // 1. tim nghe si trong mongodb
        const artist = await Artist.findById(req.body.id);

        if(!artist) {
            return res.json({success: false, message: "Không tìm thấy nghệ sĩ"});
        }

        // 2. xoa anh tren cloudinary
        if(artist.image) {
            // lay public_id tu url
            const imagePublicId = artist.image.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(imagePublicId, {resource_type: "image"});
        }

        // 3. xoa trong mongodb
        await Artist.findByIdAndDelete(req.body.id);

        res.json({success: true, message: "Đã xóa nghệ sĩ thành công"});

    }catch(error) {
        console.log(error);
        res.json({success: false, message: "Lỗi xóa nghệ sĩ"});
    }
}

// Lấy chi tiết Artist bao gồm Bài hát và Album ---
const getArtistDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Lấy thông tin Artist
        const artist = await Artist.findById(id);
        if (!artist) {
            return res.json({ success: false, message: "Artist not found" });
        }

        // 2. Lấy danh sách Album của Artist này
        const albums = await Album.find({ artist: id }).sort({ releaseDate: -1 });

        // 3. Lấy Top bài hát (ví dụ top 10 bài nhiều lượt nghe nhất)
        const topSongs = await Song.find({ artist: id })
            .sort({ plays: -1 })
            .limit(10);

        res.json({ 
            success: true, 
            artist, 
            albums, 
            topSongs 
        });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error fetching artist details" });
    }
}

const uploadToCloudinary = (buffer, resourceType, folder) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: resourceType, folder },
            (error, result) => {
                if (result) resolve(result);
                else reject(error);
            }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};

export const uploadSong = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Nghệ sĩ của bạn.' });
        }

        const { title, description, duration, category, album } = req.body;

        if (!req.files || !req.files.audio || !req.files.image) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ file audio và ảnh bìa (image).' });
        }

        const audioFile = req.files.audio[0];
        const imageFile = req.files.image[0];

        // ==================================================
        // 1. XỬ LÝ CATEGORY (Model yêu cầu Mảng Array)
        // ==================================================
        let parsedCategory = [];
        if (category) {
            try {
                parsedCategory = JSON.parse(category);
                if (!Array.isArray(parsedCategory)) {
                    parsedCategory = [parsedCategory];
                }
            } catch (error) {
                parsedCategory = [category];
            }
        }

        // ==================================================
        // 2. XỬ LÝ ALBUM (Tránh lỗi CastError của Mongoose)
        // Nếu frontend gửi chữ "none", ta phải chuyển nó thành undefined
        // ==================================================
        const parsedAlbum = (album && album !== 'none') ? album : undefined;

        let aiResult = null;
        try {
            const formData = new FormData();
            formData.append('file', audioFile.buffer, {
                filename: audioFile.originalname,
                contentType: audioFile.mimetype
            });

            const aiEndpoint = process.env.AI_SERVER_URL || 'http://127.0.0.1:8000/check-copyright/';

            const aiResponse = await axios.post(aiEndpoint, formData, {
                headers: { ...formData.getHeaders() }
            });
            aiResult = aiResponse.data;
        } catch (error) {
            console.error('Lỗi kết nối Server AI:', error.message);
            return res.status(500).json({ success: false, message: 'Server kiểm duyệt AI đang bảo trì. Vui lòng thử lại sau.' });
        }

        const bestMatch = aiResult?.top_matches?.length > 0 ? aiResult.top_matches[0] : null;
        const similarityScore = bestMatch ? bestMatch.raw_score : 0;
        const matchedSongName = bestMatch ? bestMatch.song_name : null;

        // XỬ LÝ NẾU BỊ ĐÁNH GẬY BẢN QUYỀN (REJECTED)
        if (aiResult.copyright_strike) {
            const newSong = await Song.create({
                title,
                description,
                duration: Number(duration),
                category: parsedCategory,
                artist: artist._id,
                album: parsedAlbum, // Dùng biến đã parse an toàn
                audioUrl: 'blocked_by_ai',
                imageUrl: 'blocked_by_ai',
                status: 'rejected',
                aiSimilarityScore: Math.round(similarityScore * 100),
                aiMatchedSong: matchedSongName
            });

            return res.status(403).json({
                success: false,
                message: `Phát hiện vi phạm bản quyền! Bài hát giống bài '${matchedSongName}' tới ${Math.round(similarityScore * 100)}%. Đã bị từ chối.`,
                song: newSong
            });
        }

        // CHỈ UPLOAD LÊN CLOUDINARY NẾU VƯỢT QUA BÀI TEST AI
        const [audioUploadResult, imageUploadResult] = await Promise.all([
            uploadToCloudinary(audioFile.buffer, 'video', 'songs_audio'),
            uploadToCloudinary(imageFile.buffer, 'image', 'songs_images')
        ]);

        let finalStatus = 'live';
        let message = 'Tải bài hát thành công và đã được công khai!';

        // XỬ LÝ NẾU NẰM TRONG VÙNG NGHI VẤN (CẦN ADMIN REVIEW)
        if (similarityScore >= 0.6 && similarityScore <= 0.85) {
            finalStatus = 'flagged';
            message = 'Bài hát đã được tải lên nhưng bị cảnh báo AI (Tương đồng cao). Vui lòng chờ Admin duyệt tay.';
        }

        // TẠO BÀI HÁT MỚI (LIVE HOẶC FLAGGED)
        const newSong = await Song.create({
            title,
            description,
            duration: Number(duration),
            category: parsedCategory,
            artist: artist._id,
            album: parsedAlbum, // Dùng biến đã parse an toàn
            audioUrl: audioUploadResult.secure_url,
            imageUrl: imageUploadResult.secure_url,
            status: finalStatus,
            aiSimilarityScore: Math.round(similarityScore * 100),
            aiMatchedSong: matchedSongName
        });

        return res.status(201).json({ success: true, message, song: newSong });
    } catch (error) {
        console.error("Lỗi Upload Song:", error);
        return res.status(500).json({ success: false, message: 'Lỗi server khi upload bài hát', error: error.message });
    }
};

export const getMySongs = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Artist not found' });
        }

        const songs = await Song.find({ artist: artist._id }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, songs });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createAlbum = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Nghệ sĩ của bạn.' });
        }

        const { title, description } = req.body;

        if (!title || !req.file) {
            if (req.file) {
                await cloudinary.uploader.destroy(req.file.filename);
            }
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tiêu đề album và ảnh bìa.' });
        }

        const newAlbum = new Album({
            title,
            description: description || '',
            image: req.file.path,
            artist: artist._id,
            songs: []
        });

        await newAlbum.save();
        return res.status(201).json({ success: true, message: 'Album tạo thành công!', album: newAlbum });
    } catch (error) {
        if (req.file) {
            await cloudinary.uploader.destroy(req.file.filename);
        }
        return res.status(500).json({ success: false, message: 'Lỗi tạo album', error: error.message });
    }
};

export const addSongToAlbum = async (req, res) => {
    try {
        const { albumId, songId } = req.body;

        if (!albumId || !songId) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp albumId và songId.' });
        }

        const album = await Album.findById(albumId);
        if (!album) {
            return res.status(404).json({ success: false, message: 'Album không tồn tại.' });
        }

        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist || album.artist.toString() !== artist._id.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa album này.' });
        }

        const song = await Song.findById(songId);
        if (!song) {
            return res.status(404).json({ success: false, message: 'Bài hát không tồn tại.' });
        }

        if (song.artist.toString() !== artist._id.toString()) {
            return res.status(403).json({ success: false, message: 'Bài hát không phải của bạn.' });
        }

        if (album.songs.includes(songId)) {
            return res.status(400).json({ success: false, message: 'Bài hát đã có trong album này.' });
        }

        album.songs.push(songId);
        await album.save();

        return res.status(200).json({ success: true, message: 'Thêm bài hát vào album thành công!', album });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi thêm bài hát vào album', error: error.message });
    }
};

export const getMyAlbums = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) return res.status(404).json({ success: false, message: 'Artist not found' });

        // Tìm album của artist này và populate để lấy thông tin các bài hát bên trong
        const albums = await Album.find({ artist: artist._id })
            .populate('songs')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, albums });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getDashboardStats = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) return res.status(404).json({ success: false, message: 'Artist not found' });

        // 1. Tính tổng lượt nghe (Total Streams) bằng Aggregation
        const playStats = await Song.aggregate([
            { $match: { artist: artist._id } },
            { $group: { _id: null, totalPlays: { $sum: '$plays' } } }
        ]);
        const totalStreams = playStats.length > 0 ? playStats[0].totalPlays : 0;

        // 2. Đếm tổng số bài hát và Album
        const totalTracks = await Song.countDocuments({ artist: artist._id });
        const totalAlbums = await Album.countDocuments({ artist: artist._id });

        // 3. Lấy 4 bài hát tải lên gần nhất (Recent Uploads)
        const recentUploads = await Song.find({ artist: artist._id })
            .sort({ createdAt: -1 })
            .limit(4)
            .select('title imageUrl status plays createdAt');

        res.status(200).json({
            success: true,
            stats: {
                totalStreams,
                totalTracks,
                totalAlbums,
                followers: artist.followersCount,
                recentUploads
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export { addArtist, listArtist, removeArtist, updateArtist, getArtistDetail };