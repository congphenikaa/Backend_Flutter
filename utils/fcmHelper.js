import User from '../models/User.js';

let adminApp = null;

/**
 * Lazy-init Firebase Admin SDK (chỉ khởi tạo 1 lần)
 * Nếu chưa cấu hình FIREBASE_SERVICE_ACCOUNT → bỏ qua (không crash server)
 */
const getAdminApp = async () => {
    if (adminApp) return adminApp;

    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountEnv) {
        console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT chưa được cấu hình, bỏ qua Push Notification.');
        return null;
    }

    try {
        const admin = (await import('firebase-admin')).default;
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(serviceAccountEnv)),
            });
        }
        adminApp = admin;
        return adminApp;
    } catch (err) {
        console.error('[FCM] Không thể khởi tạo Firebase Admin:', err.message);
        return null;
    }
};

/**
 * Gửi Push Notification đến user qua FCM token
 * ★ Best-effort: KHÔNG throw nếu thất bại để tránh crash main flow
 *
 * @param {string} receiverId - MongoDB ObjectId của người nhận
 * @param {{ title: string, body: string, data: object }} payload
 */
export const sendPushNotification = async (receiverId, { title, body, data = {} }) => {
    try {
        const admin = await getAdminApp();
        if (!admin) return;

        const user = await User.findById(receiverId).select('fcmToken').lean();
        if (!user?.fcmToken) return;

        await admin.messaging().send({
            token: user.fcmToken,
            notification: { title, body },
            // data phải là { key: string } — convert mọi giá trị sang string
            data: Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
            android: { priority: 'high' },
            apns: {
                payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
            },
        });

        console.log(`[FCM] Push gửi thành công đến user ${receiverId}`);
    } catch (err) {
        // Không làm crash server — chỉ log warning
        console.warn(`[FCM] Gửi push thất bại cho user ${receiverId}:`, err.message);
    }
};
