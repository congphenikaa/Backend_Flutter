import { v2 as cloudinary } from 'cloudinary';
import Category from '../models/Category.js';

// 1. THÊM CATEGORY
const addCategory = async (req, res) => {
    try {
        const { name, color } = req.body;
        const imageFile = req.file;

        if (!name || !imageFile) {
            return res.json({ success: false, message: "Vui lòng nhập tên và tải ảnh!" });
        }

        // Upload ảnh
        const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" });

        const category = new Category({
            name,
            color,
            image: imageUpload.secure_url
        });

        await category.save();
        res.json({ success: true, message: "Đã thêm Thể loại thành công" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi khi thêm Thể loại" });
    }
}

// 2. LẤY DANH SÁCH
const listCategory = async (req, res) => {
    try {
        const categories = await Category.find({});
        res.json({ success: true, categories: categories });
    } catch (error) {
        res.json({ success: false, message: "Lỗi tải danh sách" });
    }
}

const updateCategory = async (req, res) => {
    try {
        const { id, name, color } = req.body;
        const category = await Category.findById(id);

        if (!category) {
            return res.json({ success: false, message: "Không tìm thấy Thể loại" });
        }

        // Cập nhật thông tin text
        category.name = name;
        category.color = color;

        // Nếu có upload ảnh mới
        if (req.file) {
            // Xóa ảnh cũ trên Cloudinary (nếu có)
            if (category.image) {
                const urlSegments = category.image.split('/');
                const filename = urlSegments[urlSegments.length - 1].split('.')[0];
                await cloudinary.uploader.destroy(filename);
            }
            
            // Upload ảnh mới
            const imageUpload = await cloudinary.uploader.upload(req.file.path, { resource_type: "image" });
            category.image = imageUpload.secure_url;
        }

        await category.save();
        res.json({ success: true, message: "Cập nhật thành công!" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi khi cập nhật" });
    }
}

// 3. XÓA CATEGORY
const removeCategory = async (req, res) => {
    try {
        const { id } = req.body;
        const category = await Category.findById(id);
        
        if (category) {
            // Xóa ảnh trên Cloudinary để sạch sẽ
            if (category.image) {
                const urlSegments = category.image.split('/');
                const filename = urlSegments[urlSegments.length - 1].split('.')[0];
                await cloudinary.uploader.destroy(filename);
            }

            await Category.findByIdAndDelete(id);
            res.json({ success: true, message: "Đã xóa Thể loại" });
        } else {
            res.json({ success: false, message: "Không tìm thấy Thể loại" });
        }
    } catch (error) {
        res.json({ success: false, message: "Lỗi khi xóa" });
    }
}

export { addCategory, listCategory, removeCategory, updateCategory };