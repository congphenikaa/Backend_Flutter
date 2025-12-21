import express from 'express';
import { addArtist, listArtist, removeArtist, updateArtist } from '../controllers/artistController.js';
import upload from '../configs/cloudinaryConfig.js';

const artistRouter = express.Router();

// Route thêm artist: Dùng upload.single vì chỉ có 1 ảnh
artistRouter.post('/add', upload.single('image'), addArtist);

// Route liệt kê
artistRouter.get('/list', listArtist);

// Route xóa
artistRouter.post('/remove', removeArtist);

// Route sửa
artistRouter.post('/update', upload.single('image'), updateArtist);

export default artistRouter;