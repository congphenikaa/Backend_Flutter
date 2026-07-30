// /**
//  * expirePremiumJob.js
//  * Cron job chạy định kỳ — kiểm tra user premium đã quá ngày hết hạn và thu hồi quyền Premium.
//  */

// import cron from 'node-cron';
// import User from '../models/User.js';

// export const runExpirePremiumJob = async () => {
//     try {
//         const now = new Date();
//         const expiredUsers = await User.find({
//             isPremium: true,
//             premiumExpiresAt: { $lt: now },
//         });

//         if (expiredUsers.length === 0) {
//             return;
//         }

//         console.log(`[EXPIRE JOB] Tìm thấy ${expiredUsers.length} user đã hết hạn Premium. Đang xử lý...`);

//         for (const user of expiredUsers) {
//             await User.findByIdAndUpdate(user._id, {
//                 isPremium: false,
//             });
//             console.log(`[EXPIRE JOB] Đã thu hồi Premium của user: ${user._id}`);
//         }
//     } catch (err) {
//         console.error('[EXPIRE JOB] Lỗi quét user hết hạn:', err.message);
//     }
// };

// console.log(" [CronJob] Tiến trình kiểm tra hết hạn Premium đã sẵn sàng...");

// // ============================================================================
// // CRONJOB: QUÉT VÀ THU HỒI PREMIUM HẾT HẠN (Chạy mỗi 1 giờ)
// // Cú pháp: '0 * * * *' (Phút 0 của mỗi giờ)
// // ============================================================================
// cron.schedule('0 * * * *', async () => {
//     await runExpirePremiumJob();
// });
