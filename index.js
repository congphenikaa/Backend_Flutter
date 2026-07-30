import express                   from 'express';
import { createServer }          from 'http';
import dotenv                    from 'dotenv';
import cors                      from 'cors';
import connectDB                 from './configs/db.js';
import { initSocket }            from './sockets/index.js';
import authRoute                 from './routes/authRoute.js';
import songRouter                from './routes/songRoute.js';
import artistRouter              from './routes/artistRoute.js';
import albumRouter               from './routes/albumRoute.js';
import categoryRouter            from './routes/categoryRoute.js';
import playlistRouter            from './routes/playlistRoute.js';
import userRoutes                from './routes/userRoute.js';
import chartRoute                from './routes/chartRoute.js';
import adminRoute                from './routes/adminRoute.js';
import artistRequestRoutes       from './routes/artistRequestRoutes.js';
import paymentRoutes             from './routes/paymentRoutes.js';
import premiumRoute              from './routes/premiumRoute.js';
import adminPremiumRoute         from './routes/adminPremiumRoute.js';
import adRoute                   from './routes/adRoute.js';
import adminAdRoute              from './routes/adminAdRoute.js';
import playerRouter              from './routes/playerRoute.js';
import chatRoute                 from './routes/chatRoute.js';
import './workers/playCountWorker.js';
import './cronjobs/trendingDecay.js';
import './jobs/expirePremiumJob.js';

// 1. Cấu hình biến môi trường
dotenv.config();

// 2. Kết nối MongoDB (Database: Doan)
connectDB();

// 3. Khởi tạo ứng dụng Express
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROUTE ---
app.get('/', (req, res) => res.send('API Working'));
app.use('/api/auth',            authRoute);
app.use('/api/song',            songRouter);
app.use('/api/artist',          artistRouter);
app.use('/api/album',           albumRouter);
app.use('/api/category',        categoryRouter);
app.use('/api/playlist',        playlistRouter);
app.use('/api/user',            userRoutes);
app.use('/api/charts',          chartRoute);
app.use('/api/artist-requests', artistRequestRoutes);
app.use('/api/admin',           adminRoute);
app.use('/api/payment',         paymentRoutes);
app.use('/api/premium',         premiumRoute);
app.use('/api/admin/premium',   adminPremiumRoute);
app.use('/api/ads',             adRoute);
app.use('/api/admin/ads',       adminAdRoute);
app.use('/api/player',          playerRouter);
app.use('/api/chat',            chatRoute);

// 4. ★ Tạo HTTP Server từ Express app (bắt buộc để Socket.IO hoạt động)
const httpServer = createServer(app);

// 5. ★ Khởi tạo Socket.IO gắn vào httpServer
initSocket(httpServer);

// 6. Khởi chạy server (dùng httpServer, KHÔNG phải app.listen)
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} (HTTP + WebSocket)`);
});