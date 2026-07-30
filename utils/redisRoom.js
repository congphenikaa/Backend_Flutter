import redisClient from '../configs/redisConfig.js';

// ─── TTL Constants ──────────────────────────────────────────────────────────
const ROOM_TTL       = 14400; // 4 giờ — phòng tự hết hạn nếu không hoạt động
const HEARTBEAT_TTL  = 180;   // 3 phút — Active User tracking

// ─── Key Builders ────────────────────────────────────────────────────────────
const keys = {
    room:      (id) => `room:${id}`,
    queue:     (id) => `room:${id}:queue`,
    members:   (id) => `room:${id}:members`,
    skipVotes: (id) => `room:${id}:skipVotes`,
    banned:    (id) => `room:${id}:banned`,
    heartbeat: (roomId, userId) => `room:${roomId}:hb:${userId}`,
};

// ─── Tạo phòng mới ────────────────────────────────────────────────────────
/**
 * @param {string} roomId
 * @param {{ hostId, conversationId, isPremiumRoom, maxListeners }} opts
 */
export const createRoom = async (roomId, { hostId, conversationId, conversationType = 'direct', isPremiumRoom = false, maxListeners = 2 }) => {
    await redisClient.hSet(keys.room(roomId), {
        hostId,
        conversationId,
        conversationType,
        isPlaying:          '0',
        isPremiumRoom:      isPremiumRoom ? '1' : '0',
        maxListeners:       String(maxListeners),
        currentSong:        '',
        startAtTimestamp:   '',
        pausedPosition:     '0',
    });
    await redisClient.expire(keys.room(roomId), ROOM_TTL);
};

// ─── Xóa toàn bộ keys của phòng ─────────────────────────────────────────
export const deleteRoom = async (roomId) => {
    await redisClient.del([
        keys.room(roomId),
        keys.queue(roomId),
        keys.members(roomId),
        keys.skipVotes(roomId),
        keys.banned(roomId),
    ]);
    // heartbeat keys sẽ tự hết hạn — không cần xóa thủ công
};

// ─── Lấy trạng thái phòng ────────────────────────────────────────────────
/**
 * @returns {object|null} null nếu phòng không tồn tại
 */
export const getRoomState = async (roomId) => {
    const raw = await redisClient.hGetAll(keys.room(roomId));
    if (!raw || !raw.hostId) return null; // Phòng không tồn tại

    return {
        roomId,
        hostId:           raw.hostId,
        conversationId:   raw.conversationId,
        conversationType: raw.conversationType || 'direct',
        isPlaying:        raw.isPlaying === '1',
        isPremiumRoom:    raw.isPremiumRoom === '1',
        maxListeners:     parseInt(raw.maxListeners, 10) || 2,
        currentSong:      raw.currentSong ? JSON.parse(raw.currentSong) : null,
        startAtTimestamp: raw.startAtTimestamp ? parseInt(raw.startAtTimestamp, 10) : null,
        pausedPosition:   parseFloat(raw.pausedPosition) || 0,
    };
};

// ─── Cập nhật trạng thái phát nhạc ──────────────────────────────────────
/**
 * @param {string} roomId
 * @param {{ isPlaying, startAtTimestamp, pausedPosition, currentSong? }} stateObj
 */
export const updatePlayState = async (roomId, { isPlaying, startAtTimestamp, pausedPosition = 0, currentSong }) => {
    const fields = {
        isPlaying:        isPlaying ? '1' : '0',
        pausedPosition:   String(pausedPosition),
        startAtTimestamp: startAtTimestamp ? String(startAtTimestamp) : '',
    };
    if (currentSong !== undefined) {
        fields.currentSong = currentSong ? JSON.stringify(currentSong) : '';
    }
    await redisClient.hSet(keys.room(roomId), fields);
    await redisClient.expire(keys.room(roomId), ROOM_TTL);
};

// ─── Queue management ────────────────────────────────────────────────────

/**
 * Thêm bài hát vào cuối hàng đợi
 * @param {string} roomId
 * @param {object} songItem — { songId, title, artist, audioUrl, imageUrl, duration, addedBy, addedByName, addedByAvatar }
 */
export const addToQueue = async (roomId, songItem) => {
    await redisClient.rPush(keys.queue(roomId), JSON.stringify(songItem));
    await redisClient.expire(keys.queue(roomId), ROOM_TTL);
};

/**
 * Xóa bài hát theo index (dùng LSET sentinel + LREM trick — atomic-safe)
 * @param {string} roomId
 * @param {number} index — 0-based
 */
export const removeFromQueue = async (roomId, index) => {
    const SENTINEL = '__DELETED__';
    const qKey = keys.queue(roomId);

    // Đặt sentinel vào vị trí cần xóa
    await redisClient.lSet(qKey, index, SENTINEL);
    // Xóa tất cả sentinel (chỉ có 1)
    await redisClient.lRem(qKey, 1, SENTINEL);
};

/**
 * Lấy toàn bộ hàng đợi (đã filter sentinel nếu còn sót)
 * @returns {object[]}
 */
export const getQueue = async (roomId) => {
    const raw = await redisClient.lRange(keys.queue(roomId), 0, -1);
    return raw
        .filter((item) => item !== '__DELETED__')
        .map((item) => {
            try { return JSON.parse(item); }
            catch { return null; }
        })
        .filter(Boolean);
};

/**
 * Lấy bài hát đầu tiên trong queue và xóa nó (dùng khi chuyển bài)
 * @returns {object|null}
 */
export const dequeueFirst = async (roomId) => {
    const raw = await redisClient.lPop(keys.queue(roomId));
    if (!raw || raw === '__DELETED__') return null;
    try { return JSON.parse(raw); }
    catch { return null; }
};

// ─── Member management ───────────────────────────────────────────────────

export const addMember = async (roomId, userId) => {
    await redisClient.sAdd(keys.members(roomId), userId);
    await redisClient.expire(keys.members(roomId), ROOM_TTL);
};

export const removeMember = async (roomId, userId) => {
    await redisClient.sRem(keys.members(roomId), userId);
};

export const getMemberCount = async (roomId) => {
    return await redisClient.sCard(keys.members(roomId));
};

export const getMembers = async (roomId) => {
    return await redisClient.sMembers(keys.members(roomId));
};

export const isMember = async (roomId, userId) => {
    return await redisClient.sIsMember(keys.members(roomId), userId);
};

// ─── Skip Vote management ────────────────────────────────────────────────

/**
 * Thêm phiếu bỏ qua bài. Trả về số phiếu hiện tại.
 */
export const addSkipVote = async (roomId, userId) => {
    await redisClient.sAdd(keys.skipVotes(roomId), userId);
    await redisClient.expire(keys.skipVotes(roomId), ROOM_TTL);
    const voteCount = await redisClient.sCard(keys.skipVotes(roomId));
    return voteCount;
};

export const clearSkipVotes = async (roomId) => {
    await redisClient.del(keys.skipVotes(roomId));
};

export const getSkipVoteCount = async (roomId) => {
    return await redisClient.sCard(keys.skipVotes(roomId));
};

// ─── Heartbeat (Active User tracking) ────────────────────────────────────

/**
 * Refresh heartbeat — gọi mỗi 60s từ client
 * User được tính là Active nếu heartbeat key còn tồn tại (< 3 phút)
 */
export const refreshHeartbeat = async (roomId, userId) => {
    await redisClient.set(keys.heartbeat(roomId, userId), '1', { EX: HEARTBEAT_TTL });
};

/**
 * Đếm số Active Users trong phòng (có heartbeat còn hạn)
 * ★ Iterate qua members, check heartbeat key — O(N) nhưng phòng nhỏ nên OK
 */
export const getActiveUserCount = async (roomId) => {
    const members = await getMembers(roomId);
    const checks = await Promise.all(
        members.map((uid) => redisClient.exists(keys.heartbeat(roomId, uid)))
    );
    return checks.filter((v) => v === 1).length;
};

// ─── TTL refresh ─────────────────────────────────────────────────────────

/**
 * Reset TTL của tất cả keys sau mỗi hoạt động quan trọng
 */
export const refreshRoomTTL = async (roomId) => {
    await Promise.all([
        redisClient.expire(keys.room(roomId),      ROOM_TTL),
        redisClient.expire(keys.queue(roomId),     ROOM_TTL),
        redisClient.expire(keys.members(roomId),   ROOM_TTL),
        redisClient.expire(keys.skipVotes(roomId), ROOM_TTL),
        redisClient.expire(keys.banned(roomId),    ROOM_TTL),
    ]);
};

// ─── Banning ─────────────────────────────────────────────────────────────

/**
 * Thêm một người dùng vào danh sách đen của phòng
 * @param {string} roomId 
 * @param {string} userId 
 */
export const banMember = async (roomId, userId) => {
    await redisClient.sAdd(keys.banned(roomId), userId);
    await redisClient.expire(keys.banned(roomId), ROOM_TTL);
};

/**
 * Kiểm tra xem người dùng có bị cấm khỏi phòng không
 * @param {string} roomId 
 * @param {string} userId 
 * @returns {boolean}
 */
export const isBanned = async (roomId, userId) => {
    return await redisClient.sIsMember(keys.banned(roomId), userId);
};
