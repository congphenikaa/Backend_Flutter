import express from 'express';
import { addAlbum, listAlbums, removeAlbum, updateAlbum } from '../controllers/albumController.js';
import upload from '../configs/cloudinaryConfig.js';

const albumRouter = express.Router();

albumRouter.post('/add', upload.single('image'), addAlbum);
albumRouter.get('/list', listAlbums);
albumRouter.post('/remove', removeAlbum);
albumRouter.post('/update', upload.single('image'), updateAlbum);

export default albumRouter;