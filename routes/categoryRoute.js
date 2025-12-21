import express from 'express';
import { addCategory, listCategory, removeCategory, updateCategory } from '../controllers/categoryController.js';
import upload from '../configs/cloudinaryConfig.js';

const categoryRouter = express.Router();

categoryRouter.post('/add', upload.single('image'), addCategory);
categoryRouter.get('/list', listCategory);
categoryRouter.post('/remove', removeCategory);
categoryRouter.post('/update', upload.single('image'), updateCategory);

export default categoryRouter;