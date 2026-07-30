import Message      from '../models/Message.js';
import Conversation  from '../models/Conversation.js';
import {
    setUserOnline,
    setUserOffline,
    isUserOnline,
    refreshPresenceTTL,
} from '../utils/redisPresence.js';
import { sendPushNotification } from '../utils/fcmHelper.js';
import { socketRateLimiter }    from '../middlewares/socketRateLimiter.js';
import { registerRoomHandlers } from './roomHandler.js';

// ─── Giới hạn nội dung ──────────────────────────────────────────────────────
const LIMITS = {
    TEXT_MAX_LENGTH:  2000,  // ký tự
    CAPTION_MAX_LENGTH: 500, // ký tự chú thích kèm ảnh/voice
    MEDIA_MAX_SIZE:   20 * 1024 * 1024, // 20 MB (kiểm tra trên client, backend validate)
    VOICE_MAX_DURATION: 300, // giây (5 phút)
};

// ─── Hàm helper tạo preview text cho lastMessage ───────────────────────────────
function buildLastContent(type, data) {
    switch (type) {
        case 'text':        return data.content?.trim() ?? '';
        case 'song_share':  return `🎵 ${data.songData?.title ?? 'Bài nhạc'}`;
        case 'image':       return data.caption?.trim() ? `📷 ${data.caption.trim()}` : '📷 Ảnh';
        case 'voice':       return '🎙️ Tin nhắn thoại';
        case 'room_invite': return `🎧 ${data.roomInviteData?.hostName ?? 'Ai đó'} đã mở Phòng Nhạc Ảo`;
        default:            return '';
    }
}

export const registerChatHandlers = (io) => {
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`[Socket] User ${userId} connected → socketId: ${socket.id}`);

        // Đánh dấu online + tham gia room cá nhân để nhận tin nhắn
        await setUserOnline(userId, socket.id);
        socket.join(`user:${userId}`);

        // Thông báo cho các user khác biết mình online
        socket.broadcast.emit('user:online', { userId });

        // ── Virtual Music Room handlers ────────────────────────────────────
        registerRoomHandlers(io, socket, userId);

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Gửi tin nhắn (text / song_share / image / voice)
        // Payload:
        //   text:       { conversationId?, receiverId, type:'text', content }
        //   song_share: { conversationId?, receiverId, type:'song_share', songData }
        //   image:      { conversationId?, receiverId, type:'image', mediaData:{ url, mimeType, size, fileName }, caption? }
        //   voice:      { conversationId?, receiverId, type:'voice', mediaData:{ url, mimeType, size, duration } }
        // ────────────────────────────────────────────────────────────────────
        socket.on('message:send', async (data, callback) => {
            if (typeof callback !== 'function') {
                return console.warn(`[Socket] message:send không có acknowledgement callback`);
            }

            // ★ Rate limit: tối đa 5 tin/3 giây
            const allowed = await socketRateLimiter(userId, callback);
            if (!allowed) return;

            try {
                const {
                    conversationId, receiverId,
                    type, content, caption,
                    songData, mediaData, replyTo,
                } = data;

                // ── Validate type ──────────────────────────────────────────
                const VALID_TYPES = ['text', 'song_share', 'image', 'voice'];
                if (!type || !VALID_TYPES.includes(type)) {
                    return callback({ error: 'Loại tin nhắn không hợp lệ' });
                }

                // ── Validate nội dung theo từng type ──────────────────────
                if (type === 'text') {
                    if (!content?.trim()) {
                        return callback({ error: 'Nội dung tin nhắn không được để trống' });
                    }
                    if (content.trim().length > LIMITS.TEXT_MAX_LENGTH) {
                        return callback({ error: `Tin nhắn không được vượt quá ${LIMITS.TEXT_MAX_LENGTH} ký tự` });
                    }
                }

                if (type === 'song_share' && !songData?.songId) {
                    return callback({ error: 'Thiếu dữ liệu bài hát' });
                }

                if (type === 'image') {
                    if (!mediaData?.url) {
                        return callback({ error: 'Thiếu URL ảnh' });
                    }
                    if (mediaData.size && mediaData.size > LIMITS.MEDIA_MAX_SIZE) {
                        return callback({ error: 'Ảnh không được vượt quá 20MB' });
                    }
                    if (caption && caption.length > LIMITS.CAPTION_MAX_LENGTH) {
                        return callback({ error: `Chú thích không được vượt quá ${LIMITS.CAPTION_MAX_LENGTH} ký tự` });
                    }
                }

                if (type === 'voice') {
                    if (!mediaData?.url) {
                        return callback({ error: 'Thiếu URL tin nhắn thoại' });
                    }
                    if (mediaData.size && mediaData.size > LIMITS.MEDIA_MAX_SIZE) {
                        return callback({ error: 'File âm thanh không được vượt quá 20MB' });
                    }
                    if (mediaData.duration && mediaData.duration > LIMITS.VOICE_MAX_DURATION) {
                        return callback({ error: `Tin nhắn thoại không được vượt quá ${LIMITS.VOICE_MAX_DURATION / 60} phút` });
                    }
                }

                // ── Tìm / tạo conversation ─────────────────────────────────
                let conversation;
                if (conversationId) {
                    conversation = await Conversation.findById(conversationId);
                } else {
                    const sortedParticipants = [userId, receiverId].sort();
                    conversation = await Conversation.findOne({
                        participants: { $all: sortedParticipants, $size: 2 },
                    });
                    if (!conversation) {
                        conversation = await Conversation.create({
                            participants: sortedParticipants,
                            unreadCount:  {},
                        });
                    }
                }

                if (!conversation) {
                    return callback({ error: 'Không tìm thấy cuộc hội thoại' });
                }

                // ── Xây dựng document lưu vào MongoDB ────────────────────
                const messageDoc = {
                    conversationId: conversation._id,
                    senderId: userId,
                    type,
                    content: type === 'text'
                        ? content.trim()
                        : (caption?.trim() ?? ''), // caption cho image, '' cho voice/song_share
                    songData:  type === 'song_share' ? songData  : null,
                    mediaData: (type === 'image' || type === 'voice') ? mediaData : null,
                    status: 'sent',
                };

                // Gắn replyTo nếu có (validate ObjectId hợp lệ)
                if (replyTo && /^[a-f\d]{24}$/i.test(replyTo)) {
                    messageDoc.replyTo = replyTo;
                }

                const message = await Message.create(messageDoc);

                // ── Cập nhật lastMessage + unreadCount ───────────────────
                const lastContent   = buildLastContent(type, { content, caption, songData });

                // Tính toán unreadCount update
                const updateUnread = {};
                const participantIds = conversation.participants.map(p => p.toString());
                
                participantIds.forEach(pid => {
                    if (pid !== userId) {
                        const currentUnread = conversation.unreadCount?.get?.(pid) ?? 0;
                        updateUnread[`unreadCount.${pid}`] = currentUnread + 1;
                    }
                });

                await Conversation.findByIdAndUpdate(conversation._id, {
                    lastMessage: {
                        content:  lastContent,
                        type,
                        senderId: userId,
                        sentAt:   new Date(),
                    },
                    $set: updateUnread,
                    updatedAt: new Date(),
                });

                // ── Populate để client hiển thị ───────────────────────────
                let populatedMsg = await Message.findById(message._id)
                    .populate('senderId', 'name avatar username')
                    .populate({
                        path:   'replyTo',
                        select: 'senderId type content mediaData songData',
                        populate: { path: 'senderId', select: 'name username' },
                    })
                    .lean();

                // ★ Emit đến tất cả participants qua room cá nhân
                participantIds.forEach(pid => {
                    io.to(`user:${pid}`).emit('message:new', populatedMsg);
                });

                // Xác nhận về cho sender (Optimistic UI: đổi 'sending' → 'sent')
                callback({ success: true, messageId: message._id, conversationId: conversation._id.toString() });

                // ★ FCM Push Notification nếu người nhận đang offline
                for (const pid of participantIds) {
                    if (pid === userId) continue;
                    
                    const { isUserOnline } = await import('../utils/redisPresence.js');
                    if (!(await isUserOnline(pid))) {
                        // Title: Nếu là group -> "[Tên Group] Tên Người Gửi", Nếu 1-1 -> "Tên Người Gửi"
                        let pushTitle = populatedMsg.senderId?.name ?? populatedMsg.senderId?.username ?? 'Tin nhắn mới';
                        if (conversation.type === 'group' && conversation.groupName) {
                            pushTitle = `[${conversation.groupName}] ${pushTitle}`;
                        }
                        
                        await sendPushNotification(pid, {
                            title: pushTitle,
                            body:  lastContent,
                            data:  { type: 'chat', conversationId: conversation._id.toString() },
                        });
                    }
                }

                await refreshPresenceTTL(userId);
            } catch (err) {
                console.error('[Socket] message:send error:', err);
                callback({ error: 'Lỗi server, vui lòng thử lại' });
            }
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Đánh dấu đã đọc toàn bộ tin nhắn trong conversation
        // ────────────────────────────────────────────────────────────────────
        socket.on('message:read', async ({ conversationId }) => {
            try {
                // Thay vì set status: 'read', push userId vào mảng readBy nếu chưa có
                await Message.updateMany(
                    { 
                        conversationId, 
                        senderId: { $ne: userId },
                        'readBy.userId': { $ne: userId } // Chỉ update những tin chưa được user này đọc
                    },
                    { 
                        $push: { readBy: { userId, readAt: new Date() } },
                        $set: { status: 'read' } // Vẫn giữ lại status='read' cho tương thích ngược nếu cần
                    }
                );

                await Conversation.findByIdAndUpdate(conversationId, {
                    $set: { [`unreadCount.${userId}`]: 0 },
                });

                const convo = await Conversation.findById(conversationId).lean();
                if (convo && convo.participants) {
                    const participantIds = convo.participants.map(p => p.toString());
                    participantIds.forEach(pid => {
                        if (pid !== userId) {
                            io.to(`user:${pid}`).emit('message:read_receipt', {
                                conversationId,
                                readBy: userId,
                            });
                        }
                    });
                }
            } catch (err) {
                console.error('[Socket] message:read error:', err);
            }
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Toggle reaction vào tin nhắn
        // Payload: { messageId, emoji }
        // Logic:
        //   - Nếu user chưa react: thêm { userId, emoji }
        //   - Nếu user đã react cùng emoji: xoá (toggle off)
        //   - Nếu user đã react emoji khác: thay thế
        // ────────────────────────────────────────────────────────────────────
        socket.on('message:react', async ({ messageId, emoji }, callback) => {
            const ack = typeof callback === 'function' ? callback : () => {};
            try {
                if (!messageId || !emoji) {
                    return ack({ error: 'Thiếu messageId hoặc emoji' });
                }

                const message = await Message.findById(messageId);
                if (!message) {
                    return ack({ error: 'Tin nhắn không tồn tại' });
                }

                const existingIdx = message.reactions.findIndex(
                    (r) => r.userId.toString() === userId
                );

                if (existingIdx !== -1) {
                    if (message.reactions[existingIdx].emoji === emoji) {
                        // Cùng emoji → toggle off (xoá)
                        message.reactions.splice(existingIdx, 1);
                    } else {
                        // Emoji khác → thay thế
                        message.reactions[existingIdx].emoji = emoji;
                    }
                } else {
                    // Chưa react → thêm mới
                    message.reactions.push({ userId, emoji });
                }

                await message.save();

                // Notify cả 2 user trong conversation
                const convo = await Conversation.findById(message.conversationId).lean();
                const participants = convo?.participants?.map((p) => p.toString()) ?? [];

                const payload = {
                    messageId,
                    reactions: message.reactions,
                    conversationId: message.conversationId.toString(),
                };
                participants.forEach((pid) => {
                    io.to(`user:${pid}`).emit('message:reaction_updated', payload);
                });

                ack({ success: true });
            } catch (err) {
                console.error('[Socket] message:react error:', err);
                ack({ error: 'Lỗi server khi cập nhật reaction' });
            }
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Thu hồi tin nhắn
        // ────────────────────────────────────────────────────────────────────
        socket.on('message:revoke', async ({ messageId }, callback) => {
            const ack = typeof callback === 'function' ? callback : () => {};
            try {
                if (!messageId) return ack({ error: 'Thiếu messageId' });

                const message = await Message.findById(messageId);
                if (!message) return ack({ error: 'Tin nhắn không tồn tại' });
                if (message.senderId.toString() !== userId) {
                    return ack({ error: 'Không có quyền thu hồi tin nhắn này' });
                }

                message.isRevoked = true;
                message.content = '';
                message.mediaData = null;
                message.songData = null;
                message.reactions = [];
                await message.save();

                const convo = await Conversation.findById(message.conversationId).lean();
                const participants = convo?.participants?.map((p) => p.toString()) ?? [];

                participants.forEach((pid) => {
                    io.to(`user:${pid}`).emit('message:revoked', {
                        messageId,
                        conversationId: message.conversationId.toString(),
                    });
                });

                ack({ success: true });
            } catch (err) {
                console.error('[Socket] message:revoke error:', err);
                ack({ error: 'Lỗi server khi thu hồi tin nhắn' });
            }
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Chỉnh sửa tin nhắn
        // ────────────────────────────────────────────────────────────────────
        socket.on('message:edit', async ({ messageId, newContent }, callback) => {
            const ack = typeof callback === 'function' ? callback : () => {};
            try {
                if (!messageId || !newContent?.trim()) {
                    return ack({ error: 'Nội dung không hợp lệ' });
                }

                const message = await Message.findById(messageId);
                if (!message) return ack({ error: 'Tin nhắn không tồn tại' });
                if (message.senderId.toString() !== userId) {
                    return ack({ error: 'Không có quyền chỉnh sửa tin nhắn này' });
                }
                if (message.type !== 'text') {
                    return ack({ error: 'Chỉ có thể chỉnh sửa tin nhắn văn bản' });
                }
                if (message.isRevoked) {
                    return ack({ error: 'Tin nhắn đã bị thu hồi' });
                }

                message.content = newContent.trim();
                message.isEdited = true;
                await message.save();

                const convo = await Conversation.findById(message.conversationId).lean();
                const participants = convo?.participants?.map((p) => p.toString()) ?? [];

                participants.forEach((pid) => {
                    io.to(`user:${pid}`).emit('message:edited', {
                        messageId,
                        conversationId: message.conversationId.toString(),
                        newContent: message.content,
                    });
                });

                ack({ success: true });
            } catch (err) {
                console.error('[Socket] message:edit error:', err);
                ack({ error: 'Lỗi server khi chỉnh sửa tin nhắn' });
            }
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Xóa tin nhắn ở phía bạn (Delete for me)
        // ────────────────────────────────────────────────────────────────────
        socket.on('message:delete_for_me', async ({ messageId }, callback) => {
            const ack = typeof callback === 'function' ? callback : () => {};
            try {
                if (!messageId) return ack({ error: 'Thiếu messageId' });

                const message = await Message.findById(messageId);
                if (!message) return ack({ error: 'Tin nhắn không tồn tại' });

                if (!message.deletedFor.includes(userId)) {
                    message.deletedFor.push(userId);
                    await message.save();
                }

                ack({ success: true });
            } catch (err) {
                console.error('[Socket] message:delete_for_me error:', err);
                ack({ error: 'Lỗi server khi xóa tin nhắn' });
            }
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Typing indicator
        // ────────────────────────────────────────────────────────────────────
        socket.on('typing:start', ({ conversationId, receiverId }) => {
            socket.to(`user:${receiverId}`).emit('typing:start', {
                conversationId,
                userId,
            });
        });

        socket.on('typing:stop', ({ receiverId }) => {
            socket.to(`user:${receiverId}`).emit('typing:stop', { userId });
        });

        // ────────────────────────────────────────────────────────────────────
        // EVENT: Disconnect
        // ────────────────────────────────────────────────────────────────────
        socket.on('disconnect', async (reason) => {
            console.log(`[Socket] User ${userId} disconnected → reason: ${reason}`);
            await setUserOffline(userId);
            socket.broadcast.emit('user:offline', { userId });
        });
    });
};
