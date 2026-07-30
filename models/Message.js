import mongoose from 'mongoose';

// -----------------------------------------------------------
// Sub-schema: Snapshot bài hát tại thời điểm gửi
// ★ Dùng snapshot thay vì ref để tránh broken link khi bài hát bị xóa
// -----------------------------------------------------------
const SongSnapshotSchema = new mongoose.Schema(
    {
        songId:   { type: String, required: true },
        title:    { type: String, required: true },
        artist:   { type: String, required: true },
        imageUrl: { type: String, required: true },
        audioUrl: { type: String, required: true },
        duration: { type: Number, required: true }, // đơn vị: giây
    },
    { _id: false }
);

// -----------------------------------------------------------
// Sub-schema: Dữ liệu file media (image / voice)
// ★ Tách riêng khỏi `content` để schema sạch sẽ và dễ mở rộng.
//   `content` chỉ dùng cho text/caption, mediaData chứa URL + metadata.
// -----------------------------------------------------------
const MediaDataSchema = new mongoose.Schema(
    {
        // URL file trên Cloudinary — bắt buộc
        url:      { type: String, required: true },

        // MIME type gốc, VD: 'image/jpeg', 'audio/m4a'
        mimeType: { type: String, default: '' },

        // Kích thước file tính bằng bytes (để hiển thị thông tin + giới hạn)
        size:     { type: Number, default: 0 },

        // Chỉ có giá trị khi type === 'voice' — đơn vị: giây
        duration: { type: Number, default: 0 },

        // Tên file gốc (tuỳ chọn, dùng cho UX tải xuống)
        fileName: { type: String, default: '' },
    },
    { _id: false }
);

// -----------------------------------------------------------
// Message Schema
// -----------------------------------------------------------
const MessageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // Hỗ trợ text, song_share, image, voice, room_invite, system
        type: {
            type: String,
            enum: ['text', 'song_share', 'image', 'voice', 'room_invite', 'system'],
            required: true,
            default: 'text',
        },

        // Văn bản thuần / chú thích ảnh (caption) / thông báo hệ thống
        // ★ KHÔNG lưu URL media vào đây — dùng mediaData thay thế
        content: { type: String, default: '', maxlength: 2000 },

        // Chỉ có giá trị khi type === 'song_share'
        songData: { type: SongSnapshotSchema, default: null },

        // Chỉ có giá trị khi type === 'image' hoặc 'voice'
        mediaData: { type: MediaDataSchema, default: null },

        // Chỉ có giá trị khi type === 'room_invite'
        // Lưu metadata phòng để bubble có thể hiển thị trạng thái + nút Tham gia
        roomInviteData: {
            type: new mongoose.Schema({
                roomId:        { type: String, required: true },
                hostName:      { type: String, required: true },
                hostAvatar:    { type: String, default: '' },
                isPremiumRoom: { type: Boolean, default: false },
            }, { _id: false }),
            default: null,
        },

        // Trạng thái tin nhắn (sending chỉ dùng trên client Optimistic UI)
        status: {
            type: String,
            enum: ['sent', 'delivered', 'read'],
            default: 'sent',
        },

        // Lưu trữ ai đã đọc tin nhắn này và khi nào (Dùng cho cả 1-1 và group)
        readBy: [
            {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                readAt: { type: Date, default: Date.now },
                _id: false,
            }
        ],

        // Reply: trỏ đến tin nhắn gốc
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },

        // Reactions: mỗi user tối đa 1 emoji
        reactions: [
            {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                emoji:  { type: String, maxlength: 10 }, // '❤️', '🔥', '👍', '😂', '😢'
                _id: false,
            },
        ],

        // Soft delete: ẩn tin nhắn theo từng user mà không xóa khỏi DB
        deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

        // Tin nhắn đã bị thu hồi hay chưa
        isRevoked: { type: Boolean, default: false },

        // Tin nhắn đã bị chỉnh sửa hay chưa
        isEdited: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// ★ Compound index: Phân trang cursor-based theo conversationId + createdAt
MessageSchema.index({ conversationId: 1, createdAt: -1 });

// ★ Index cho việc đánh dấu đã đọc hàng loạt
MessageSchema.index({ conversationId: 1, senderId: 1, status: 1 });

export default mongoose.model('Message', MessageSchema);
