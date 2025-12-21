import Artist from '../models/Artist.js';
import {v2 as cloudinary} from 'cloudinary';

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

export { addArtist, listArtist, removeArtist, updateArtist};