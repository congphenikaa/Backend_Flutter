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
  if (file.fieldname === "audio") {
    // Chỉ cho phép file nhạc
    if (file.mimetype === "audio/mpeg" || file.mimetype === "audio/mp3" || file.mimetype === "audio/wav") {
      cb(null, true);
    } else {
      cb(new Error("Sai định dạng! Trường 'audio' chỉ chấp nhận MP3, WAV."), false);
    }
  } else if (file.fieldname === "image") {
    // Chỉ cho phép file ảnh
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
      cb(null, true);
    } else {
      cb(new Error("Sai định dạng! Trường 'image' chỉ chấp nhận PNG, JPG."), false);
    }
  } else {
    cb(new Error("Trường dữ liệu không xác định!"), false);
  }
};

const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter ,
  limits: {
    fileSize: 10 * 1024 * 1024 // [BẢO MẬT 2]: Giới hạn file tối đa 10MB (tránh treo server)
  }
});

export default upload;