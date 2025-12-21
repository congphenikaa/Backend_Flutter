import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './configs/db.js'; 
import authRoute from './routes/authRoute.js';
import songRouter from './routes/songRoute.js';
import artistRouter from './routes/artistRoute.js';
import albumRouter from './routes/albumRoute.js';
import categoryRouter from './routes/categoryRoute.js';

// 1. Cấu hình biến môi trường
dotenv.config();

// 2. Kết nối MongoDB (Database: Doan)
connectDB();

// 3. Khởi tạo ứng dụng Express
const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true}));

// --- ROUTE ---
app.get('/', (req, res)=> res.send("API Working"))
app.use('/api/auth', authRoute);
app.use('/api/song', songRouter);
app.use('/api/artist', artistRouter);
app.use("/api/album", albumRouter);
app.use("/api/category", categoryRouter);

// Khởi chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})