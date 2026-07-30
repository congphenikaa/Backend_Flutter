import Message      from '../models/Message.js';
import Conversation  from '../models/Conversation.js';
import User          from '../models/User.js';
import { getRoomState as getRedisRoomState, getQueue } from '../utils/redisRoom.js';

// ─────────────────────────────────────────────────────────────
// GET /api/chat/conversations?before=<conversationId>&limit=20
// Cursor-based pagination — tránh miss item khi real-time thêm conversation mới
// ─────────────────────────────────────────────────────────────
export const getConversations = async (req, res) => {
    try {
        const { before, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr, 10) || 20, 50); // tối đa 50

        const filter = { participants: req.user._id };

        // Chỉ lấy conversation CŨ HƠN cursor (cuộn xuống để load thêm)
        if (before) {
            filter._id = { $lt: before };
        }

        const conversations = await Conversation.find(filter)
            .sort({ updatedAt: -1 })
            .limit(limit + 1) // lấy thêm 1 để biết còn dữ liệu không
            .populate('participants', 'username avatar')
            .lean();

        const hasMore = conversations.length > limit;
        const data    = hasMore ? conversations.slice(0, limit) : conversations;

        res.json({ success: true, data, hasMore });
    } catch (err) {
        console.error('[ChatController] getConversations:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/chat/conversations/:id/messages?before=<messageId>
// Cursor-based pagination — KHÔNG dùng skip() để tránh miss tin khi real-time
//
// ★ Trả về mảng sort createdAt: -1 (mới nhất trước)
//   Flutter dùng ListView(reverse: true) để render đúng thứ tự
// ─────────────────────────────────────────────────────────────
export const getMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { before, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr, 10) || 20, 50);

        const filter = {
            conversationId,
            deletedFor: { $ne: req.user._id },
        };

        if (before) {
            filter._id = { $lt: before };
        }

        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('senderId', 'name username avatar')
            .populate({
                path:   'replyTo',
                select: 'senderId type content mediaData songData',
                populate: { path: 'senderId', select: 'name username' },
            })
            .lean();

        const conversation = await Conversation.findById(conversationId).lean();
        const activeRoomId = conversation ? conversation.activeRoomId : null;

        res.json({ success: true, data: messages, hasMore: messages.length >= limit, activeRoomId });
    } catch (err) {
        console.error('[ChatController] getMessages:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/chat/messages/:id/react
// Toggle reaction vào tin nhắn qua HTTP (fallback khi socket chưa sẵn sàng)
// Body: { emoji: '❤️' }
// ─────────────────────────────────────────────────────────────
export const addReaction = async (req, res) => {
    try {
        const { id: messageId } = req.params;
        const { emoji }         = req.body;
        const userId            = req.user._id.toString();

        if (!emoji) {
            return res.status(400).json({ success: false, message: 'Thiếu emoji' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Tin nhắn không tồn tại' });
        }

        const existingIdx = message.reactions.findIndex(
            (r) => r.userId.toString() === userId
        );

        if (existingIdx !== -1) {
            if (message.reactions[existingIdx].emoji === emoji) {
                message.reactions.splice(existingIdx, 1);
            } else {
                message.reactions[existingIdx].emoji = emoji;
            }
        } else {
            message.reactions.push({ userId, emoji });
        }

        await message.save();

        res.json({ success: true, reactions: message.reactions });
    } catch (err) {
        console.error('[ChatController] addReaction:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/chat/fcm-token
// Flutter đăng ký FCM token sau khi login để nhận Push Notification
// ─────────────────────────────────────────────────────────────
export const saveFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            return res.status(400).json({ success: false, message: 'fcmToken không được để trống' });
        }

        await User.findByIdAndUpdate(req.user._id, { fcmToken });
        res.json({ success: true, message: 'FCM token đã được cập nhật' });
    } catch (err) {
        console.error('[ChatController] saveFcmToken:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ───────────────────────────────────────────────────────────────
// GET /api/chat/rooms/:roomId/state
// Flutter gọi khi app restart để kiểm tra phòng vẫn còn active không
// Và đồng bộ trạng thái (Late-joiner sync sau resume)
// ───────────────────────────────────────────────────────────────
export const getRoomStateHttp = async (req, res) => {
    try {
        const { roomId } = req.params;
        if (!roomId) return res.status(400).json({ success: false, message: 'Thiếu roomId' });

        const state = await getRedisRoomState(roomId);
        if (!state) {
            return res.json({ success: false, message: 'Phòng không tồn tại hoặc đã kết thúc' });
        }

        // Tính lại seekPosition để trả về cho late-joiner
        let seekPosition = 0;
        if (state.isPlaying && state.startAtTimestamp) {
            seekPosition = Math.max(0, (Date.now() - state.startAtTimestamp) / 1000);
        } else {
            seekPosition = state.pausedPosition || 0;
        }

        const queue = await getQueue(roomId);
        res.json({ success: true, state, queue, seekPosition });
    } catch (err) {
        console.error('[ChatController] getRoomState:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ───────────────────────────────────────────────────────────────
// GET /api/chat/conversations/:id/room
// Kiểm tra conversation có phòng đang mở không (dùng khi open chat screen)
// ───────────────────────────────────────────────────────────────
export const getConversationRoom = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const convo = await Conversation.findById(conversationId)
            .select('activeRoomId participants')
            .lean();

        if (!convo) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại' });
        }

        // Kiểm tra user có phải participant không
        const isParticipant = convo.participants.some(
            (p) => p.toString() === req.user._id.toString()
        );
        if (!isParticipant) {
            return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
        }

        // Nếu có activeRoomId, kiểm tra phòng có thực sự tồn tại trong Redis không
        let activeRoomId = convo.activeRoomId || null;
        if (activeRoomId) {
            const roomState = await getRedisRoomState(activeRoomId);
            if (!roomState) {
                // Phòng đã hết hạn trong Redis → reset MongoDB
                await Conversation.findByIdAndUpdate(conversationId, { activeRoomId: null });
                activeRoomId = null;
            }
        }

        res.json({ success: true, activeRoomId });
    } catch (err) {
        console.error('[ChatController] getConversationRoom:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
