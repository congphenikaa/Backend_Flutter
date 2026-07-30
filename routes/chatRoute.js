import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
    getConversations,
    getMessages,
    saveFcmToken,
    addReaction,
    getRoomStateHttp,
    getConversationRoom,
} from '../controllers/chatController.js';
import {
    createGroup,
    getGroupDetails,
    addMembers,
    kickMember,
    leaveGroup,
    renameGroup,
} from '../controllers/chatGroupController.js';

const router = express.Router();

// Tất cả routes đều yêu cầu đăng nhập
router.use(protect);

// GET  /api/chat/conversations                    → Danh sách hội thoại (cursor-based)
// GET  /api/chat/conversations/:id/messages       → Tin nhắn (cursor-based)
// POST /api/chat/messages/:id/react               → Toggle reaction
// POST /api/chat/fcm-token                        → Đăng ký FCM token
router.get('/conversations',              getConversations);
router.get('/conversations/:id/messages', getMessages);
router.post('/messages/:id/react',        addReaction);
router.post('/fcm-token',                 saveFcmToken);

// ── Group Chat ──────────────────────────────────────────────────────────────
// POST   /api/chat/groups                         → Tạo nhóm
// GET    /api/chat/groups/:id                     → Lấy thông tin nhóm
// PUT    /api/chat/groups/:id/members             → Thêm thành viên
// DELETE /api/chat/groups/:id/members/:userId     → Đuổi thành viên
// POST   /api/chat/groups/:id/leave               → Rời nhóm
router.post('/groups',                       createGroup);
router.get('/groups/:id',                    getGroupDetails);
router.put('/groups/:id/rename',             renameGroup);
router.put('/groups/:id/members',            addMembers);
router.delete('/groups/:id/members/:userId', kickMember);
router.post('/groups/:id/leave',             leaveGroup);

// ── Virtual Music Room ──────────────────────────────────────────────────────
// GET /api/chat/rooms/:roomId/state               → Lấy trạng thái phòng (reconnect)
// GET /api/chat/conversations/:id/room            → Kiểm tra phòng đang mở của conversation
router.get('/rooms/:roomId/state',        getRoomStateHttp);
router.get('/conversations/:id/room',     getConversationRoom);

export default router;
