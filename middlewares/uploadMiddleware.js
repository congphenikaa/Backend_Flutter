import multer from 'multer';

// Sử dụng bộ nhớ RAM để lưu file tạm thời
const storage = multer.memoryStorage();

// Cấu hình filter để chỉ nhận file audio và image
const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'audio' && (file.mimetype.includes('audio/') || file.mimetype.includes('video/'))) {
        cb(null, true);
    } else if (file.fieldname === 'image' && file.mimetype.includes('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Định dạng file không được hỗ trợ!'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }
});

// Middleware nhận nhiều file cùng lúc từ form
export const uploadSongFiles = upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]);
