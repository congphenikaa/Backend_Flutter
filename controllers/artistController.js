import Artist from '../models/Artist.js';
import Album from '../models/Album.js';
import Song from '../models/Songs.js';
import PendingSong from '../models/PendingSong.js';
import CopyrightStrike from '../models/CopyrightStrike.js';
import mongoose from 'mongoose';
import {v2 as cloudinary} from 'cloudinary';
import axios from 'axios';
import FormData from 'form-data';
import streamifier from 'streamifier';

const getCloudinaryPublicId = (url) => {
    if (!url || typeof url !== 'string' || !url.includes('/upload/')) {
        return null;
    }

    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/');
    const fileName = parts.pop();
    const folder = parts.pop();

    if (!fileName || !folder) {
        return null;
    }

    return `${folder}/${fileName.split('.')[0]}`;
};

const destroyCloudinaryAsset = async (url, resourceType) => {
    const publicId = getCloudinaryPublicId(url);
    if (!publicId) {
        return;
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

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
        const topSongs = await Song.find({ artist: id, status: 'live' })
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

        if (!title || !description || !duration) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ tiêu đề, mô tả và thời lượng bài hát.' });
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

        // ==================================================
        // Lấy thông tin từ AI (Yêu cầu FastAPI trả về risk_level)
        // ==================================================
        const riskLevel = (aiResult.risk_level || 'LOW').toUpperCase(); // LOW, MEDIUM, HIGH
        const highestScore = aiResult.raw_ai_score || 0;
        const matchedSongName = aiResult.matched_song || 'Không xác định';
        const aiMatches = aiResult.matches || [];

        // ==================================================
        // NHÁNH 1: RỦI RO CAO (HIGH) -> CHỈ GHI NHẬN VI PHẠM
        // ==================================================
        if (riskLevel === 'HIGH') {
            const strike = await CopyrightStrike.create({
                title,
                description,
                duration: Number(duration),
                category: parsedCategory,
                artist: artist._id,
                userId: req.user._id,
                album: parsedAlbum,
                audioUrl: null,
                imageUrl: null,
                aiSimilarityScore: Math.round(highestScore * 100),
                aiMatchedSong: matchedSongName,
                aiMatches: aiMatches,
                strikeReason: `AI risk level HIGH: ${matchedSongName}`
            });

            return res.status(403).json({
                success: false,
                message: `Phát hiện vi phạm bản quyền! Bài hát giống bài '${matchedSongName}' tới ${Math.round(highestScore * 100)}%. Đã bị từ chối.`,
                strike
            });
        }

        // ==================================================
        // UPLOAD FILES CHỈ KHI BÀI HÁT KHÔNG BỊ TỪ CHỐI
        // ==================================================
        let audioUploadResult = null;
        let imageUploadResult = null;

        try {
            const [audioUploadSettled, imageUploadSettled] = await Promise.allSettled([
                uploadToCloudinary(audioFile.buffer, 'video', 'songs_audio'),
                uploadToCloudinary(imageFile.buffer, 'image', 'songs_images')
            ]);

            if (audioUploadSettled.status !== 'fulfilled' || imageUploadSettled.status !== 'fulfilled') {
                if (audioUploadSettled.status === 'fulfilled') {
                    await destroyCloudinaryAsset(audioUploadSettled.value.secure_url, 'video');
                }

                if (imageUploadSettled.status === 'fulfilled') {
                    await destroyCloudinaryAsset(imageUploadSettled.value.secure_url, 'image');
                }

                throw new Error('Không thể tải file lên Cloudinary');
            }

            audioUploadResult = audioUploadSettled.value;
            imageUploadResult = imageUploadSettled.value;
        } catch (uploadError) {
            console.error('Lỗi upload Cloudinary:', uploadError.message);
            return res.status(500).json({ success: false, message: 'Lỗi tải file lên hệ thống lưu trữ', error: uploadError.message });
        }

        let responseMessage = 'Tải bài hát thành công và đã được công khai!';
        const uploadedAssetUrls = [
            { url: audioUploadResult.secure_url, resourceType: 'video' },
            { url: imageUploadResult.secure_url, resourceType: 'image' }
        ];

        try {
            // ==================================================
            // NHÁNH 2: VÙNG NGHI VẤN (MEDIUM) -> ĐẨY CHO ADMIN DUYỆT TAY
            // ==================================================
            if (riskLevel === 'MEDIUM') {
                const pendingSongId = new mongoose.Types.ObjectId();
                const pendingSong = await PendingSong.create({
                    _id: pendingSongId,
                    sourceSongId: pendingSongId,
                    title,
                    description,
                    duration: Number(duration),
                    category: parsedCategory,
                    artist: artist._id,
                    userId: req.user._id,
                    album: parsedAlbum,
                    audioUrl: audioUploadResult.secure_url,
                    imageUrl: imageUploadResult.secure_url,
                    riskLevel: 'MEDIUM',
                    aiSimilarityScore: Math.round(highestScore * 100),
                    aiMatchedSong: matchedSongName,
                    aiMatches: aiMatches,
                    sourceReason: 'AI medium risk pending review'
                });

                responseMessage = 'Bài hát đã được tải lên và đang chờ Admin kiểm duyệt.';

                return res.status(202).json({ success: true, message: responseMessage, song: pendingSong });
            }

            // ==================================================
            // LƯU DATABASE TẠO BÀI HÁT MỚI
            // ==================================================
            const newSong = await Song.create({
                title,
                description,
                duration: Number(duration),
                category: parsedCategory,
                artist: artist._id,
                album: parsedAlbum,
                audioUrl: audioUploadResult.secure_url,
                imageUrl: imageUploadResult.secure_url,
                status: 'live',
                aiSimilarityScore: Math.round(highestScore * 100),
                aiMatchedSong: matchedSongName
            });

            return res.status(201).json({ success: true, message: responseMessage, song: newSong });
        } catch (databaseError) {
            await Promise.allSettled(uploadedAssetUrls.map((asset) => destroyCloudinaryAsset(asset.url, asset.resourceType)));
            throw databaseError;
        }
    } catch (error) {
        if (error && error.name === 'MongooseError') {
            console.error('Mongoose error while uploading song:', error);
        }

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

        const [publishedSongs, pendingSongs] = await Promise.all([
            Song.find({ artist: artist._id, status: 'live' }).sort({ createdAt: -1 }).lean(),
            PendingSong.find({ artist: artist._id }).sort({ createdAt: -1 }).lean()
        ]);

        const songs = [
            ...publishedSongs.map((song) => ({ ...song, sourceCollection: 'Song', moderationState: 'live' })),
            ...pendingSongs.map((song) => ({ ...song, sourceCollection: 'PendingSong', moderationState: song.status || 'pending_review' }))
        ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

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

        if (song.status !== 'live') {
            return res.status(400).json({ success: false, message: 'Chỉ có thể thêm bài hát đã phát hành vào album.' });
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

export const updateAlbum = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Nghệ sĩ của bạn.' });
        }

        const { albumId, title, description, songIds } = req.body;

        if (!albumId) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp albumId.' });
        }

        const album = await Album.findById(albumId);
        if (!album) {
            return res.status(404).json({ success: false, message: 'Album không tồn tại.' });
        }

        if (album.artist.toString() !== artist._id.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa album này.' });
        }

        if (title) album.title = title;
        if (description !== undefined) album.description = description;

        // Nếu có ảnh mới thì xóa ảnh cũ và upload ảnh mới
        if (req.file) {
            if (album.image) {
                try {
                    const oldPublicId = album.image.split('/').slice(-2).join('/').split('.')[0];
                    await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'image' });
                } catch (err) {
                    console.log('Lỗi xóa ảnh bìa cũ:', err);
                }
            }
            album.image = req.file.path;
        }

        // Nếu có danh sách bài hát mới thì cập nhật
        if (songIds) {
            let parsedSongIds;
            try {
                parsedSongIds = JSON.parse(songIds);
            } catch {
                parsedSongIds = Array.isArray(songIds) ? songIds : [songIds];
            }
            album.songs = parsedSongIds;
        }

        await album.save();
        const updatedAlbum = await Album.findById(albumId).populate('songs');
        return res.status(200).json({ success: true, message: 'Cập nhật album thành công!', album: updatedAlbum });
    } catch (error) {
        if (req.file) {
            try {
                await cloudinary.uploader.destroy(req.file.filename);
            } catch (_) {}
        }
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật album', error: error.message });
    }
};

export const deleteAlbum = async (req, res) => {
    try {
        const artist = await Artist.findOne({ userId: req.user._id });
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ Nghệ sĩ của bạn.' });
        }

        const { albumId } = req.body;
        if (!albumId) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp albumId.' });
        }

        const album = await Album.findById(albumId);
        if (!album) {
            return res.status(404).json({ success: false, message: 'Album không tồn tại.' });
        }

        if (album.artist.toString() !== artist._id.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa album này.' });
        }

        // Xóa ảnh bìa trên Cloudinary
        if (album.image) {
            try {
                const imagePublicId = album.image.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(imagePublicId, { resource_type: 'image' });
            } catch (err) {
                console.log('Lỗi xóa ảnh bìa album:', err);
            }
        }

        await Album.findByIdAndDelete(albumId);
        return res.status(200).json({ success: true, message: 'Xóa album thành công!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi xóa album', error: error.message });
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

        // 2. Đếm tổng số bài hát đã phát hành và bài đang chờ duyệt
        const [publishedTrackCount, pendingTrackCount, totalAlbums] = await Promise.all([
            Song.countDocuments({ artist: artist._id, status: 'live' }),
            PendingSong.countDocuments({ artist: artist._id }),
            Album.countDocuments({ artist: artist._id })
        ]);
        const totalTracks = publishedTrackCount + pendingTrackCount;

        // 3. Lấy 4 bài hát tải lên gần nhất (Recent Uploads) + Top 5 bài hát nhiều plays nhất
        const [recentPublishedSongs, recentPendingSongs, topTracks] = await Promise.all([
            Song.find({ artist: artist._id, status: 'live' })
                .sort({ createdAt: -1 })
                .limit(4)
                .select('title imageUrl status plays createdAt')
                .lean(),
            PendingSong.find({ artist: artist._id })
                .sort({ createdAt: -1 })
                .limit(4)
                .select('title imageUrl status createdAt')
                .lean(),
            Song.find({ artist: artist._id, status: 'live' })
                .sort({ plays: -1 })
                .limit(5)
                .select('title imageUrl plays duration createdAt')
                .lean()
        ]);

        const recentUploads = [
            ...recentPublishedSongs.map((song) => ({ ...song, sourceCollection: 'Song' })),
            ...recentPendingSongs.map((song) => ({ ...song, sourceCollection: 'PendingSong', plays: 0 }))
        ]
            .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
            .slice(0, 4);

        res.status(200).json({
            success: true,
            stats: {
                artistName: artist.name,
                artistImage: artist.image,
                totalStreams,
                totalTracks,
                publishedTracks: publishedTrackCount,
                pendingTracks: pendingTrackCount,
                totalAlbums,
                followers: artist.followersCount,
                recentUploads,
                topTracks
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export { addArtist, listArtist, removeArtist, updateArtist, getArtistDetail };