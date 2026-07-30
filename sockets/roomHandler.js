import { v4 as uuidv4 }       from 'uuid';
import Conversation             from '../models/Conversation.js';
import Message                  from '../models/Message.js';
import User                     from '../models/User.js';
import PremiumPlan              from '../models/PremiumPlan.js';
import { sendPushNotification } from '../utils/fcmHelper.js';
import {
    createRoom,
    deleteRoom,
    getRoomState,
    updatePlayState,
    addToQueue,
    removeFromQueue,
    getQueue,
    dequeueFirst,
    addMember,
    removeMember,
    getMemberCount,
    getMembers,
    isMember,
    addSkipVote,
    clearSkipVotes,
    getSkipVoteCount,
    refreshHeartbeat,
    getActiveUserCount,
    refreshRoomTTL,
    banMember,
    isBanned
} from '../utils/redisRoom.js';

// ─── Giới hạn Listener mặc định cho tài khoản Free (không có PremiumPlan) ──
const FREE_MAX_LISTENERS = 2;

// ─── Hàm helper: lấy thông tin user ngắn gọn ────────────────────────────────
const getUserInfo = async (userId) => {
    return await User.findById(userId).select('name username avatar isPremium premiumPlanCode').lean();
};

// ─── Hàm helper: kiểm tra và lấy giới hạn phòng theo Premium Plan ───────────
const getRoomLimits = async (user) => {
    if (!user?.isPremium || !user?.premiumPlanCode) {
        return { maxListeners: FREE_MAX_LISTENERS, isPremiumRoom: false, roomQualityMax: 'standard' };
    }
    const plan = await PremiumPlan.findOne({ code: user.premiumPlanCode, isActive: true }).lean();
    if (!plan) {
        return { maxListeners: FREE_MAX_LISTENERS, isPremiumRoom: false, roomQualityMax: 'standard' };
    }
    return {
        maxListeners:  plan.maxRoomListeners ?? FREE_MAX_LISTENERS,
        isPremiumRoom: true,
        roomQualityMax: plan.roomQualityMax ?? 'standard',
    };
};

// ─── Hàm helper: gửi room_invite message vào conversation ───────────────────
const sendRoomInviteMessage = async (io, conversation, hostUser, roomId, isPremiumRoom) => {
    try {
        const messageDoc = await Message.create({
            conversationId: conversation._id,
            senderId:       hostUser._id,
            type:           'room_invite',
            content:        '',
            roomInviteData: {
                roomId,
                hostName:      hostUser.name || hostUser.username || 'Người dùng',
                hostAvatar:    hostUser.avatar || '',
                isPremiumRoom,
            },
            status: 'sent',
        });

        // Populate để phát socket đúng format
        const populated = await Message.findById(messageDoc._id)
            .populate('senderId', 'name avatar username')
            .lean();

        // Cập nhật lastMessage của conversation
        await Conversation.findByIdAndUpdate(conversation._id, {
            lastMessage: {
                content:  `🎧 ${hostUser.name || hostUser.username || 'Ai đó'} đã mở Phòng Nhạc Ảo`,
                type:     'room_invite',
                senderId: hostUser._id,
                sentAt:   new Date(),
            },
            updatedAt: new Date(),
        });

        // Broadcast tin nhắn invite đến tất cả participants
        const participantIds = conversation.participants.map((p) => p.toString());
        participantIds.forEach((pid) => {
            io.to(`user:${pid}`).emit('message:new', populated);
        });

        // FCM push cho participants đang offline (ngoại trừ host)
        for (const pid of participantIds) {
            if (pid === hostUser._id.toString()) continue;
            const { isUserOnline } = await import('../utils/redisPresence.js');
            if (!(await isUserOnline(pid))) {
                await sendPushNotification(pid, {
                    title: `🎧 ${hostUser.name || hostUser.username || 'Bạn bè'} đã mở Phòng Nhạc Ảo`,
                    body:  'Tham gia để nghe nhạc cùng nhau!',
                    data:  { type: 'room_invite', roomId, conversationId: conversation._id.toString() },
                });
            }
        }

        return populated;
    } catch (err) {
        console.error('[RoomHandler] sendRoomInviteMessage error:', err);
        return null;
    }
};

// ─── Helper: lấy danh sách member kèm thông tin đầy đủ (userId, name, avatar) ───
const getMembersWithInfo = async (roomId) => {
    const memberIds = await getMembers(roomId);
    const users = await Promise.all(memberIds.map((id) => getUserInfo(id)));
    return users
        .filter(Boolean)
        .map((u) => ({
            userId: u._id.toString(),
            name:   u.name || u.username || 'Người dùng',
            avatar: u.avatar || '',
        }));
};

// ────────────────────────────────────────────────────────────────────────────
// Main: đăng ký tất cả Room handlers cho một socket connection
// ────────────────────────────────────────────────────────────────────────────
export const registerRoomHandlers = (io, socket, userId) => {

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: room:create — Host mở phòng nghe nhạc
    // Payload: { conversationId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('room:create', async (data, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        try {
            const { conversationId } = data || {};
            if (!conversationId) return ack({ error: 'Thiếu conversationId' });

            // Kiểm tra conversation tồn tại + user là participant
            const conversation = await Conversation.findById(conversationId).lean();
            if (!conversation) return ack({ error: 'Không tìm thấy cuộc hội thoại' });

            const isParticipant = conversation.participants.some((p) => p.toString() === userId);
            if (!isParticipant) return ack({ error: 'Bạn không thuộc cuộc hội thoại này' });

            // Nếu đã có phòng đang mở → trả về phòng đó
            if (conversation.activeRoomId) {
                const existingState = await getRoomState(conversation.activeRoomId);
                if (existingState) {
                    const queue   = await getQueue(conversation.activeRoomId);
                    const members = await getMembersWithInfo(conversation.activeRoomId);
                    socket.join(`room:${conversation.activeRoomId}`);
                    await addMember(conversation.activeRoomId, userId);
                    await refreshHeartbeat(conversation.activeRoomId, userId);
                    
                    let seekPosition = 0;
                    if (existingState.isPlaying && existingState.startAtTimestamp) {
                        seekPosition = (Date.now() - existingState.startAtTimestamp) / 1000;
                        seekPosition = Math.max(0, seekPosition);
                    } else {
                        seekPosition = existingState.pausedPosition || 0;
                    }
                    
                    return ack({ success: true, roomId: conversation.activeRoomId, state: existingState, queue, members, seekPosition });
                }
                // Room đã hết hạn trong Redis → reset conversation
                await Conversation.findByIdAndUpdate(conversationId, { activeRoomId: null });
            }

            // Lấy thông tin user và Premium limits
            const hostUser   = await getUserInfo(userId);
            const roomLimits = await getRoomLimits(hostUser);
            const roomId     = uuidv4();

            // Tạo room trong Redis
            await createRoom(roomId, {
                hostId:           userId,
                conversationId,
                conversationType: conversation.type || 'direct',
                isPremiumRoom:    roomLimits.isPremiumRoom,
                maxListeners:     roomLimits.maxListeners,
            });

            // Gắn roomId vào conversation
            await Conversation.findByIdAndUpdate(conversationId, { activeRoomId: roomId });

            // Host tham gia socket room + thêm vào members
            socket.join(`room:${roomId}`);
            await addMember(roomId, userId);
            await refreshHeartbeat(roomId, userId);

            // Gửi tin nhắn room_invite vào conversation
            const conv = await Conversation.findById(conversationId); // non-lean để populate
            await sendRoomInviteMessage(io, conv, hostUser, roomId, roomLimits.isPremiumRoom);

            const state = await getRoomState(roomId);
            console.log(`[Room] ${userId} đã tạo phòng ${roomId} (max:${roomLimits.maxListeners} listeners)`);

            ack({ success: true, roomId, state, queue: [], seekPosition: 0 });
        } catch (err) {
            console.error('[RoomHandler] room:create error:', err);
            ack({ error: 'Lỗi server khi tạo phòng' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: room:join — Listener tham gia phòng
    // Payload: { roomId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('room:join', async (data, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        try {
            const { roomId } = data || {};
            if (!roomId) return ack({ error: 'Thiếu roomId' });

            const state = await getRoomState(roomId);
            if (!state) return ack({ error: 'Phòng không tồn tại hoặc đã kết thúc' });

            // Kiểm tra xem user có bị cấm không
            const banned = await isBanned(roomId, userId);
            if (banned) {
                return ack({ error: 'Bạn đã bị cấm khỏi phòng này' });
            }

            // Kiểm tra giới hạn người (không tính host)
            const memberCount = await getMemberCount(roomId);
            // memberCount bao gồm tất cả members (host + listeners)
            // Listeners = tất cả members trừ host
            const listenerCount = Math.max(0, memberCount - 1); // host không tính
            if (state.hostId !== userId && listenerCount >= state.maxListeners) {
                return ack({ error: `Phòng đã đầy (tối đa ${state.maxListeners} người nghe)` });
            }

            // Tham gia socket room
            socket.join(`room:${roomId}`);
            await addMember(roomId, userId);
            await refreshHeartbeat(roomId, userId);
            await refreshRoomTTL(roomId);

            // ★ Late-joiner Sync: tính seekPosition hiện tại
            let seekPosition = 0;
            if (state.isPlaying && state.startAtTimestamp) {
                seekPosition = (Date.now() - state.startAtTimestamp) / 1000; // giây
                seekPosition = Math.max(0, seekPosition);
            } else {
                seekPosition = state.pausedPosition || 0;
            }

            const queue   = await getQueue(roomId);
            const members = await getMembersWithInfo(roomId);

            // Lấy thông tin user mới để broadcast
            const joinerUser = await getUserInfo(userId);

            // Notify các thành viên khác
            socket.to(`room:${roomId}`).emit('room:member_joined', {
                userId,
                name:   joinerUser?.name || joinerUser?.username || 'Người dùng',
                avatar: joinerUser?.avatar || '',
            });

            console.log(`[Room] ${userId} đã tham gia phòng ${roomId} (seek: ${seekPosition.toFixed(1)}s)`);

            ack({ success: true, roomId, state, queue, members, seekPosition });
        } catch (err) {
            console.error('[RoomHandler] room:join error:', err);
            ack({ error: 'Lỗi server khi tham gia phòng' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: room:leave — Listener rời phòng
    // Payload: { roomId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('room:leave', async ({ roomId } = {}) => {
        try {
            if (!roomId) return;
            const state = await getRoomState(roomId);
            if (!state) return;

            await removeMember(roomId, userId);
            socket.leave(`room:${roomId}`);

            io.to(`room:${roomId}`).emit('room:member_left', { userId });
            console.log(`[Room] ${userId} đã rời phòng ${roomId}`);
        } catch (err) {
            console.error('[RoomHandler] room:leave error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: room:kick — Host cấm/đuổi một thành viên
    // Payload: { roomId, targetUserId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('room:kick', async (data, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        try {
            const { roomId, targetUserId } = data || {};
            if (!roomId || !targetUserId) return ack({ error: 'Thiếu thông tin' });

            const state = await getRoomState(roomId);
            if (!state) return ack({ error: 'Phòng không tồn tại' });

            if (state.hostId !== userId) return ack({ error: 'Chỉ chủ phòng mới được kick người khác' });
            if (targetUserId === userId) return ack({ error: 'Không thể tự kick chính mình' });

            // Ban member
            await banMember(roomId, targetUserId);
            
            // Xóa member khỏi danh sách active
            await removeMember(roomId, targetUserId);
            
            // Phát sự kiện tới chính user bị kick để client của họ tự leave room
            io.to(`user:${targetUserId}`).emit('room:kicked', { roomId });
            
            // Cập nhật member list cho toàn phòng
            io.to(`room:${roomId}`).emit('room:member_left', { userId: targetUserId });

            console.log(`[Room] Host ${userId} đã kick ${targetUserId} khỏi phòng ${roomId}`);
            ack({ success: true });
        } catch (err) {
            console.error('[RoomHandler] room:kick error:', err);
            ack({ error: 'Lỗi server khi kick thành viên' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: room:close — Host đóng phòng
    // Payload: { roomId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('room:close', async (data, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        try {
            const { roomId } = data || {};
            if (!roomId) return ack({ error: 'Thiếu roomId' });

            const state = await getRoomState(roomId);
            if (!state) return ack({ error: 'Phòng không tồn tại' });

            // Chỉ host mới được đóng phòng
            if (state.hostId !== userId) return ack({ error: 'Chỉ chủ phòng mới được đóng phòng' });

            // Broadcast trước khi xóa để clients trong phòng nhận được event
            io.to(`room:${roomId}`).emit('room:closed', {
                roomId,
                reason: 'host_left',
            });

            // Gửi sự kiện cho toàn bộ những người trong conversation để họ cập nhật UI (ChatController)
            if (state.conversationId) {
                const conversation = await Conversation.findById(state.conversationId).lean();
                if (conversation && conversation.participants) {
                    conversation.participants.forEach(p => {
                        io.to(`user:${p.toString()}`).emit('room:closed', {
                            roomId,
                            reason: 'host_left',
                        });
                    });
                }
            }

            // Dọn dẹp Redis và MongoDB
            await deleteRoom(roomId);
            await Conversation.findOneAndUpdate(
                { activeRoomId: roomId },
                { activeRoomId: null }
            );

            console.log(`[Room] Host ${userId} đã đóng phòng ${roomId}`);
            ack({ success: true });
        } catch (err) {
            console.error('[RoomHandler] room:close error:', err);
            ack({ error: 'Lỗi server khi đóng phòng' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: player:play — Host phát nhạc (Latency Compensation)
    // Payload: { roomId, songData? }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('player:play', async ({ roomId, songData } = {}) => {
        try {
            if (!roomId) return;
            const state = await getRoomState(roomId);
            if (!state || state.hostId !== userId) return;

            const BUFFER_MS   = 700; // Buffer để tất cả client chuẩn bị
            const triggerAt   = Date.now() + BUFFER_MS;
            const isResuming  = !songData;
            const currentSong = songData || state.currentSong;
            const startingPos = isResuming ? state.pausedPosition : 0;
            const newStartAt  = triggerAt - (startingPos * 1000);

            await updatePlayState(roomId, {
                isPlaying:        true,
                startAtTimestamp: newStartAt,
                pausedPosition:   startingPos,
                currentSong,
            });
            await refreshRoomTTL(roomId);

            io.to(`room:${roomId}`).emit('player:sync_play', {
                triggerAt,
                song:         currentSong,
                seekPosition: startingPos,
            });
        } catch (err) {
            console.error('[RoomHandler] player:play error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: player:pause — Host tạm dừng nhạc
    // Payload: { roomId, pausedAt } — pausedAt: giây
    // ──────────────────────────────────────────────────────────────────────
    socket.on('player:pause', async ({ roomId, pausedAt = 0 } = {}) => {
        try {
            if (!roomId) return;
            const state = await getRoomState(roomId);
            if (!state || state.hostId !== userId) return;

            await updatePlayState(roomId, {
                isPlaying:      false,
                pausedPosition: pausedAt,
                startAtTimestamp: null,
            });
            await refreshRoomTTL(roomId);

            io.to(`room:${roomId}`).emit('player:sync_pause', { pausedAt });
        } catch (err) {
            console.error('[RoomHandler] player:pause error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: player:seek — Host tua nhạc
    // Payload: { roomId, position } — position: giây
    // ──────────────────────────────────────────────────────────────────────
    socket.on('player:seek', async ({ roomId, position = 0 } = {}) => {
        try {
            if (!roomId) return;
            const state = await getRoomState(roomId);
            if (!state || state.hostId !== userId) return;

            // Back-calculate startAtTimestamp để late-joiner sync luôn đúng
            const newStartAt = state.isPlaying ? Date.now() - (position * 1000) : null;

            await updatePlayState(roomId, {
                isPlaying:        state.isPlaying,
                startAtTimestamp: newStartAt,
                pausedPosition:   position,
                currentSong:      state.currentSong,
            });

            io.to(`room:${roomId}`).emit('player:sync_seek', { position });
        } catch (err) {
            console.error('[RoomHandler] player:seek error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: player:next — Host chuyển sang bài tiếp theo
    // Payload: { roomId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('player:next', async ({ roomId } = {}) => {
        try {
            if (!roomId) return;
            const state = await getRoomState(roomId);
            if (!state || state.hostId !== userId) return;

            const nextSong = await dequeueFirst(roomId);
            if (!nextSong) return; // Queue trống

            const BUFFER_MS = 700;
            const triggerAt = Date.now() + BUFFER_MS;

            await updatePlayState(roomId, {
                isPlaying:        true,
                startAtTimestamp: triggerAt,
                pausedPosition:   0,
                currentSong:      nextSong,
            });
            await clearSkipVotes(roomId);
            await refreshRoomTTL(roomId);

            const queue = await getQueue(roomId);
            io.to(`room:${roomId}`).emit('queue:updated', { queue });
            io.to(`room:${roomId}`).emit('player:sync_play', {
                triggerAt,
                song:         nextSong,
                seekPosition: 0,
            });
        } catch (err) {
            console.error('[RoomHandler] player:next error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: queue:add — Thêm bài vào hàng đợi (Host + Listener đều được)
    // Payload: { roomId, songData: { songId, title, artist, audioUrl, imageUrl, duration } }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('queue:add', async (data, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        try {
            const { roomId, songData } = data || {};
            if (!roomId || !songData?.songId) return ack({ error: 'Thiếu roomId hoặc songData' });

            // Kiểm tra user là member
            const member = await isMember(roomId, userId);
            if (!member) return ack({ error: 'Bạn không ở trong phòng này' });

            // Lấy thông tin user để gắn vào queue item
            const adderUser = await getUserInfo(userId);
            const songItem = {
                ...songData,
                addedBy:       userId,
                addedByName:   adderUser?.name || adderUser?.username || 'Người dùng',
                addedByAvatar: adderUser?.avatar || '',
            };

            await addToQueue(roomId, songItem);
            const queue = await getQueue(roomId);

            io.to(`room:${roomId}`).emit('queue:updated', { queue });
            ack({ success: true });
        } catch (err) {
            console.error('[RoomHandler] queue:add error:', err);
            ack({ error: 'Lỗi khi thêm bài vào hàng đợi' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: queue:remove — Xóa bài khỏi hàng đợi
    // Payload: { roomId, songIndex, addedBy }
    // Quyền: Owner của bài hoặc Host
    // ──────────────────────────────────────────────────────────────────────
    socket.on('queue:remove', async (data, callback) => {
        const ack = typeof callback === 'function' ? callback : () => {};
        try {
            const { roomId, songIndex, addedBy } = data || {};
            if (roomId === undefined || songIndex === undefined) {
                return ack({ error: 'Thiếu roomId hoặc songIndex' });
            }

            const state = await getRoomState(roomId);
            if (!state) return ack({ error: 'Phòng không tồn tại' });

            // Kiểm tra quyền: chỉ owner của bài hoặc host
            const isHost = state.hostId === userId;
            const isOwner = addedBy === userId;
            if (!isHost && !isOwner) {
                return ack({ error: 'Bạn không có quyền xóa bài này' });
            }

            await removeFromQueue(roomId, songIndex);
            const queue = await getQueue(roomId);

            io.to(`room:${roomId}`).emit('queue:updated', { queue });
            ack({ success: true });
        } catch (err) {
            console.error('[RoomHandler] queue:remove error:', err);
            ack({ error: 'Lỗi khi xóa bài khỏi hàng đợi' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: vote:skip — Listener bỏ phiếu qua bài
    // Payload: { roomId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('vote:skip', async ({ roomId } = {}) => {
        try {
            if (!roomId) return;
            const state = await getRoomState(roomId);
            if (!state) return;

            // Host không cần vote — dùng player:next trực tiếp
            if (state.hostId === userId) return;

            // Kiểm tra user là member
            const member = await isMember(roomId, userId);
            if (!member) return;

            const voteCount   = await addSkipVote(roomId, userId);

            // Active users = tổng members có heartbeat còn hạn
            const activeCount = await getActiveUserCount(roomId);
            // Chỉ tính listeners (trừ host) — listeners có quyền vote
            const activeListeners  = Math.max(1, activeCount - 1);
            const requiredVotes    = Math.ceil(activeListeners * 0.5); // > 50%

            // Lấy tên người vote để hiển thị toast
            const skipperUser = await getUserInfo(userId);
            const skipperName = skipperUser?.name || skipperUser?.username || 'Người dùng';

            io.to(`room:${roomId}`).emit('vote:skip_updated', {
                voteCount,
                requiredVotes,
                skipperName,
            });

            // Kiểm tra đủ phiếu chưa
            if (voteCount >= requiredVotes) {
                // Đủ phiếu → chuyển bài
                await clearSkipVotes(roomId);
                const nextSong = await dequeueFirst(roomId);

                if (nextSong) {
                    const BUFFER_MS = 700;
                    const triggerAt = Date.now() + BUFFER_MS;

                    await updatePlayState(roomId, {
                        isPlaying:        true,
                        startAtTimestamp: triggerAt,
                        pausedPosition:   0,
                        currentSong:      nextSong,
                    });
                    await refreshRoomTTL(roomId);

                    const queue = await getQueue(roomId);
                    io.to(`room:${roomId}`).emit('queue:updated', { queue });
                    io.to(`room:${roomId}`).emit('vote:skip_approved', { nextSong });
                    io.to(`room:${roomId}`).emit('player:sync_play', {
                        triggerAt,
                        song:         nextSong,
                        seekPosition: 0,
                    });
                } else {
                    // Queue trống — dừng nhạc
                    await updatePlayState(roomId, { isPlaying: false, pausedPosition: 0 });
                    io.to(`room:${roomId}`).emit('vote:skip_approved', { nextSong: null });
                    io.to(`room:${roomId}`).emit('player:sync_pause', { pausedAt: 0 });
                }
            }
        } catch (err) {
            console.error('[RoomHandler] vote:skip error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // EVENT: room:heartbeat — Client gửi mỗi 60s để báo còn active
    // Payload: { roomId }
    // ──────────────────────────────────────────────────────────────────────
    socket.on('room:heartbeat', async ({ roomId } = {}) => {
        try {
            if (!roomId) return;
            await refreshHeartbeat(roomId, userId);
            await refreshRoomTTL(roomId);
        } catch (err) {
            console.error('[RoomHandler] room:heartbeat error:', err);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    // Dọn dẹp khi user disconnect — tự động rời tất cả phòng đang tham gia
    // ──────────────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
        try {
            // Tìm tất cả rooms mà user đang ở (từ socket rooms)
            const socketRooms = Array.from(socket.rooms).filter((r) => r.startsWith('room:'));
            for (const roomKey of socketRooms) {
                const roomId = roomKey.replace('room:', '');
                const state  = await getRoomState(roomId);
                if (!state) continue;

                if (state.hostId === userId) {
                    // Host disconnect → đóng phòng
                    io.to(`room:${roomId}`).emit('room:closed', { roomId, reason: 'host_disconnected' });
                    await deleteRoom(roomId);
                    await Conversation.findOneAndUpdate({ activeRoomId: roomId }, { activeRoomId: null });
                    console.log(`[Room] Host ${userId} disconnect → phòng ${roomId} đã đóng`);
                } else {
                    // Listener disconnect → rời phòng
                    await removeMember(roomId, userId);
                    io.to(`room:${roomId}`).emit('room:member_left', { userId });
                    console.log(`[Room] Listener ${userId} disconnect → đã rời phòng ${roomId}`);
                }
            }
        } catch (err) {
            console.error('[RoomHandler] disconnect cleanup error:', err);
        }
    });
};
