import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import PremiumPlan from '../models/PremiumPlan.js';
import { getIO } from '../sockets/index.js';

// --- Hàm Helper ---
// Lấy giới hạn nhóm dựa theo Premium Plan của user
const getGroupLimits = async (user) => {
    if (!user?.isPremium || !user?.premiumPlanCode) {
        return 5; // Default for Free
    }
    const plan = await PremiumPlan.findOne({ code: user.premiumPlanCode, isActive: true }).lean();
    if (!plan) {
        return 5;
    }
    return plan.maxGroupMembers ?? 5;
};

// Push tin nhắn system
const pushSystemMessage = async (conversationId, content, senderId, io) => {
    const messageDoc = await Message.create({
        conversationId,
        senderId,
        type: 'system',
        content,
        status: 'sent',
    });

    const populatedMsg = await Message.findById(messageDoc._id)
        .populate('senderId', 'name username avatar')
        .lean();

    // Cập nhật lastMessage
    const conversation = await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
            content,
            type: 'system',
            senderId,
            sentAt: new Date(),
        },
        updatedAt: new Date(),
    }, { new: true });

    // Broadcast cho toàn bộ participants qua io.to('user:id')
    if (conversation && conversation.participants) {
        const participantIds = conversation.participants.map(p => p.toString());
        participantIds.forEach(pid => {
            io.to(`user:${pid}`).emit('message:new', populatedMsg);
        });
    }
    
    return populatedMsg;
};

// ─────────────────────────────────────────────────────────────
// POST /api/chat/groups
// Input: { groupName: String, userIds: [String] }
// ─────────────────────────────────────────────────────────────
export const createGroup = async (req, res) => {
    try {
        const { groupName, userIds } = req.body;
        const currentUserId = req.user._id.toString();

        if (!groupName || groupName.trim() === '') {
            return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
        }
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Phải chọn ít nhất 1 người để tạo nhóm' });
        }

        // Loại bỏ chính mình nếu client vô tình gửi lên
        const membersToAdd = userIds.filter(id => id !== currentUserId);
        
        // Kiểm tra limit
        const limit = await getGroupLimits(req.user);
        const totalMembers = membersToAdd.length + 1; // +1 là người tạo
        
        if (totalMembers > limit) {
            return res.status(400).json({ 
                success: false, 
                message: `Gói cước hiện tại của bạn chỉ cho phép nhóm tối đa ${limit} thành viên. Vui lòng nâng cấp Premium để tạo nhóm lớn hơn.`
            });
        }

        // Tạo participants array
        const participants = [currentUserId, ...membersToAdd];

        // Tạo Conversation group
        const conversation = await Conversation.create({
            type: 'group',
            groupName: groupName.trim(),
            participants,
            adminIds: [currentUserId],
            unreadCount: {},
        });

        const io = getIO();
        
        // Push tin nhắn system
        const senderName = req.user.name || req.user.username;
        await pushSystemMessage(conversation._id, `${senderName} đã tạo nhóm`, currentUserId, io);

        res.status(201).json({ success: true, conversationId: conversation._id });
    } catch (err) {
        console.error('[ChatGroupController] createGroup:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/chat/groups/:id/rename
// Input: { groupName: String }
// ─────────────────────────────────────────────────────────────
export const renameGroup = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { groupName } = req.body;
        const currentUserId = req.user._id.toString();

        if (!groupName || groupName.trim() === '') {
            return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ success: false, message: 'Nhóm không tồn tại' });
        }

        // Kiểm tra quyền admin
        const isAdmin = conversation.adminIds.some(id => id.toString() === currentUserId);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được đổi tên nhóm' });
        }

        conversation.groupName = groupName.trim();
        await conversation.save();

        const senderName = req.user.name || req.user.username;
        const io = getIO();
        
        await pushSystemMessage(conversationId, `${senderName} đã đổi tên nhóm thành "${groupName.trim()}"`, currentUserId, io);

        res.json({ success: true, message: 'Đổi tên nhóm thành công' });
    } catch (err) {
        console.error('[ChatGroupController] renameGroup:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/chat/groups/:id/members
// Input: { userIds: [String] }
// ─────────────────────────────────────────────────────────────
export const addMembers = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { userIds } = req.body;
        const currentUserId = req.user._id.toString();

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Phải chọn ít nhất 1 người để thêm vào nhóm' });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ success: false, message: 'Nhóm không tồn tại' });
        }

        // Kiểm tra quyền (chỉ admin mới được thêm)
        const isAdmin = conversation.adminIds.some(id => id.toString() === currentUserId);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được thêm người vào nhóm' });
        }

        // Lọc ra các user chưa có trong nhóm
        const currentParticipantIds = conversation.participants.map(id => id.toString());
        const membersToAdd = userIds.filter(id => !currentParticipantIds.includes(id) && id !== currentUserId);

        if (membersToAdd.length === 0) {
            return res.status(400).json({ success: false, message: 'Tất cả người được chọn đã có trong nhóm' });
        }

        // Kiểm tra limit
        const limit = await getGroupLimits(req.user);
        const newTotal = currentParticipantIds.length + membersToAdd.length;

        if (newTotal > limit) {
            return res.status(400).json({ 
                success: false, 
                message: `Thêm ${membersToAdd.length} người sẽ vượt quá giới hạn ${limit} thành viên của nhóm. Vui lòng nâng cấp Premium.`
            });
        }

        // Cập nhật Database
        conversation.participants.push(...membersToAdd);
        await conversation.save();

        // Lấy tên những người được thêm để gửi thông báo
        const addedUsers = await User.find({ _id: { $in: membersToAdd } }).select('name username').lean();
        const addedNames = addedUsers.map(u => u.name || u.username).join(', ');
        
        const senderName = req.user.name || req.user.username;
        const io = getIO();
        
        await pushSystemMessage(conversationId, `${senderName} đã thêm ${addedNames} vào nhóm`, currentUserId, io);

        res.json({ success: true, message: 'Thêm thành viên thành công' });
    } catch (err) {
        console.error('[ChatGroupController] addMembers:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/chat/groups/:id/members/:userId
// ─────────────────────────────────────────────────────────────
export const kickMember = async (req, res) => {
    try {
        const { id: conversationId, userId: targetUserId } = req.params;
        const currentUserId = req.user._id.toString();

        const conversation = await Conversation.findById(conversationId);
        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ success: false, message: 'Nhóm không tồn tại' });
        }

        // Kiểm tra quyền admin
        const isAdmin = conversation.adminIds.some(id => id.toString() === currentUserId);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được đuổi người khỏi nhóm' });
        }

        // Không cho phép tự đuổi chính mình qua API này (dùng leave thay thế)
        if (targetUserId === currentUserId) {
            return res.status(400).json({ success: false, message: 'Bạn không thể tự đuổi chính mình' });
        }

        // Kiểm tra user có trong nhóm không
        const currentParticipantIds = conversation.participants.map(id => id.toString());
        if (!currentParticipantIds.includes(targetUserId)) {
            return res.status(400).json({ success: false, message: 'Người dùng không có trong nhóm' });
        }

        // Xóa user khỏi nhóm
        conversation.participants = conversation.participants.filter(id => id.toString() !== targetUserId);
        
        // Nếu user bị đuổi là admin, xóa quyền admin
        conversation.adminIds = conversation.adminIds.filter(id => id.toString() !== targetUserId);

        await conversation.save();

        // Gửi thông báo hệ thống
        const targetUser = await User.findById(targetUserId).select('name username').lean();
        const targetName = targetUser?.name || targetUser?.username || 'Một thành viên';
        
        const io = getIO();
        await pushSystemMessage(conversationId, `${targetName} đã bị xóa khỏi nhóm`, currentUserId, io);

        // Notify specifically to the kicked user so they can update their UI
        io.to(`user:${targetUserId}`).emit('group:kicked', { conversationId });

        res.json({ success: true, message: 'Đã đuổi thành viên khỏi nhóm' });
    } catch (err) {
        console.error('[ChatGroupController] kickMember:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/chat/groups/:id/leave
// ─────────────────────────────────────────────────────────────
export const leaveGroup = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const currentUserId = req.user._id.toString();

        const conversation = await Conversation.findById(conversationId);
        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ success: false, message: 'Nhóm không tồn tại' });
        }

        const currentParticipantIds = conversation.participants.map(id => id.toString());
        if (!currentParticipantIds.includes(currentUserId)) {
            return res.status(400).json({ success: false, message: 'Bạn không ở trong nhóm này' });
        }

        // Cập nhật mảng participants
        conversation.participants = conversation.participants.filter(id => id.toString() !== currentUserId);
        
        // Gửi thông báo rời nhóm trước khi save và random admin mới (nếu cần)
        const senderName = req.user.name || req.user.username;
        const io = getIO();
        
        // Nếu nhóm trống -> có thể xem xét xóa luôn nhóm, hoặc giữ nguyên
        if (conversation.participants.length === 0) {
            // Xóa luôn nhóm nếu không còn ai
            await Conversation.findByIdAndDelete(conversationId);
            return res.json({ success: true, message: 'Đã rời và giải tán nhóm vì không còn ai' });
        }

        // Nếu user rời nhóm là admin, kiểm tra xem còn admin nào khác không
        const wasAdmin = conversation.adminIds.some(id => id.toString() === currentUserId);
        conversation.adminIds = conversation.adminIds.filter(id => id.toString() !== currentUserId);

        if (wasAdmin && conversation.adminIds.length === 0) {
            // Nếu không còn admin nào, chỉ định random một người còn lại làm admin
            const newAdminId = conversation.participants[0];
            conversation.adminIds.push(newAdminId);
            
            const newAdminUser = await User.findById(newAdminId).select('name username').lean();
            const newAdminName = newAdminUser?.name || newAdminUser?.username;
            
            // Thông báo chỉ định admin mới
            await pushSystemMessage(conversationId, `${newAdminName} đã được chỉ định làm Quản trị viên mới`, currentUserId, io);
        }

        await conversation.save();

        await pushSystemMessage(conversationId, `${senderName} đã rời nhóm`, currentUserId, io);

        res.json({ success: true, message: 'Đã rời nhóm' });
    } catch (err) {
        console.error('[ChatGroupController] leaveGroup:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/chat/groups/:id
// ─────────────────────────────────────────────────────────────
export const getGroupDetails = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const currentUserId = req.user._id.toString();

        const conversation = await Conversation.findById(conversationId)
            .populate('participants', 'name username avatar')
            .lean();

        if (!conversation || conversation.type !== 'group') {
            return res.status(404).json({ success: false, message: 'Nhóm không tồn tại' });
        }

        const currentParticipantIds = conversation.participants.map(p => p._id.toString());
        if (!currentParticipantIds.includes(currentUserId)) {
            return res.status(403).json({ success: false, message: 'Bạn không ở trong nhóm này' });
        }

        res.json({ success: true, data: conversation });
    } catch (err) {
        console.error('[ChatGroupController] getGroupDetails:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
