import { v2 as cloudinary } from 'cloudinary';
import Album from '../models/Album.js';

// 1. THÊM ALBUM
const addAlbum = async (req, res) => {
    try {
        const title = req.body.title;
        const description = req.body.description;
        const releaseDate = req.body.releaseDate;
        const artistId = req.body.artist; 

        const imageFile = req.file;

        // Validate cơ bản
        if (!title || !artistId || !imageFile) {
            return res.json({ success: false, message: "Vui lòng nhập Title, chọn Artist và tải ảnh!" });
        }

        // Upload ảnh
        const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" });

        const album = new Album({
            title,
            description,
            releaseDate,
            artist: artistId,
            image: imageUpload.secure_url,
            songs: [] // Mặc định lúc tạo chưa có bài hát, sẽ thêm sau
        });

        await album.save();
        res.json({ success: true, message: "Đã thêm Album thành công" });

    } catch (error) {
        console.log(error);
        // Rollback: Xóa ảnh nếu lỗi DB
        if (req.file) await cloudinary.uploader.destroy(req.file.filename);
        res.json({ success: false, message: "Lỗi khi thêm Album" });
    }
}

// 2. LẤY DANH SÁCH (Có Populate Artist)
const listAlbums = async (req, res) => {
    try {
        // .populate("artist") giúp lấy toàn bộ info của Artist thay vì chỉ lấy ID
        const allAlbums = await Album.find({}).populate("artist"); 
        res.json({ success: true, albums: allAlbums });
    } catch (error) {
        res.json({ success: false, message: "Lỗi tải danh sách" });
    }
}

// 3. XÓA ALBUM
const removeAlbum = async (req, res) => {
    try {
        const id = req.body.id;
        const album = await Album.findById(id);
        
        if (album) {
            // Xóa ảnh trên Cloudinary
            if (album.image) {
                const urlSegments = album.image.split('/');
                const filename = urlSegments[urlSegments.length - 1].split('.')[0];
                await cloudinary.uploader.destroy(filename);
            }
            
            await Album.findByIdAndDelete(id);
            res.json({ success: true, message: "Đã xóa Album" });
        } else {
            res.json({ success: false, message: "Không tìm thấy Album" });
        }
    } catch (error) {
        res.json({ success: false, message: "Lỗi khi xóa" });
    }
}

// 4. SỬA ALBUM (UPDATE)
const updateAlbum = async (req, res) => {
    try {
        const { id, title, description, releaseDate, artist } = req.body;

        const album = await Album.findById(id);
        if (!album) return res.json({ success: false, message: "Không tìm thấy Album" });

        // Cập nhật thông tin text
        album.title = title;
        album.description = description;
        album.releaseDate = releaseDate;
        album.artist = artist; // Cập nhật artist nếu người dùng chọn người khác

        // Nếu có up ảnh mới
        if (req.file) {
            // Xóa ảnh cũ
            if (album.image) {
                const urlSegments = album.image.split('/');
                const filename = urlSegments[urlSegments.length - 1].split('.')[0];
                await cloudinary.uploader.destroy(filename);
            }
            // Up ảnh mới
            const imageUpload = await cloudinary.uploader.upload(req.file.path, { resource_type: "image" });
            album.image = imageUpload.secure_url;
        }

        await album.save();
        res.json({ success: true, message: "Cập nhật Album thành công" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi khi cập nhật" });
    }
}

export { addAlbum, listAlbums, removeAlbum, updateAlbum };