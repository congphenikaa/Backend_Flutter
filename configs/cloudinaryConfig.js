import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config(); 

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'spotify-clone-music',
    resource_type: 'auto',
  },
});

const fileFilter = (req, file, cb) => {
  // Danh sách mime types cho phép (Mở rộng thêm)
  const allowedAudioTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a", "audio/ogg"];
  const allowedImageTypes = [
    "image/png", 
    "image/jpeg", 
    "image/jpg", 
    "image/webp", 
    "image/gif", 
    "image/heic", 
    "image/heif"
  ];

  if (file.fieldname === "audio") {
    if (allowedAudioTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Sai định dạng Audio! Chỉ chấp nhận: ${allowedAudioTypes.join(", ")}`), false);
    }
  } else if (file.fieldname === "image") {s
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Sai định dạng Ảnh! Chỉ chấp nhận: JPG, PNG, WEBP, HEIC...`), false);
    }
  } else {
    cb(new Error("Trường dữ liệu không xác định!"), false);
  }
};

const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter ,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

export default upload;