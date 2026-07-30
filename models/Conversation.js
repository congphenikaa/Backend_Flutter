import mongoose from 'mongoose';

// -----------------------------------------------------------
// Conversation Schema — hội thoại 1-1 giữa 2 người dùng
// -----------------------------------------------------------
const ConversationSchema = new mongoose.Schema(
    {
        // ★ Luôn sort participants trước khi lưu để [A,B] === [B,A] (Chỉ áp dụng cho direct chat)
        participants: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        ],

        // Phân loại: 'direct' (1-1) hoặc 'group' (nhóm)
        type: { type: String, enum: ['direct', 'group'], default: 'direct' },

        // Dữ liệu riêng cho nhóm (nếu type === 'group')
        groupName: { type: String, default: '' },
        groupAvatar: { type: String, default: '' },
        adminIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Danh sách admin

        // ID phòng nghe chung đang hoạt động gắn với conversation này
        // null = không có phòng nào đang mở
        activeRoomId: { type: String, default: null },

        // Preview tin nhắn mới nhất — hiển thị trong danh sách hội thoại
        lastMessage: {
            content:  { type: String, default: '' },
            type:     { type: String, enum: ['text', 'song_share', 'image', 'voice', 'room_invite', 'system'], default: 'text' },
            senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Dùng chung cho tin nhắn system (người thực hiện hành động)
            sentAt:   { type: Date, default: Date.now },
        },

        // Đếm tin chưa đọc theo từng user: Map { "userId": 3 }
        unreadCount: { type: Map, of: Number, default: {} },
    },
    { timestamps: true }
);

// ★ Index cho việc tìm conversation theo userId (query chính)
ConversationSchema.index({ participants: 1 });

// // ★ Unique index: ngăn duplicate conversation cho cùng 2 user
// //   Hoạt động vì participants luôn được sort() trước khi lưu → [A,B] === [B,A]
// ConversationSchema.index({ participants: 1 }, { unique: true, name: 'unique_participants' });

// ★ Index để sắp xếp danh sách hội thoại theo mới nhất
ConversationSchema.index({ updatedAt: -1 });

export default mongoose.model('Conversation', ConversationSchema);
