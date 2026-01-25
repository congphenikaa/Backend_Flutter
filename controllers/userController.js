import User from "../models/User.js"; 
import Artist from "../models/Artist.js";

// Lấy thông tin chi tiết User theo ID
const getUserDetail = async (req, res) => {
  try {
    const userId = req.params.id;

    // Tìm user trong DB theo ID
    // .select("-password") để KHÔNG trả về mật khẩu
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    // Trả về dữ liệu thành công
    return res.status(200).json({
      success: true,
      user: user,
    });
  } catch (error) {
    console.error("Lỗi getUserDetail:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi Server",
    });
  }
};

// 1. API Toggle Like Song (Thích/Bỏ thích bài hát)
const toggleLikeSong = async (req, res) => {
  try {
    const userId = req.user.id; // Lấy từ token verify
    const { songId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isLiked = user.likedSongs.includes(id => id.toString() === songId);

    if (isLiked) {
      // Nếu đã like -> Bỏ like (Pull)
      await User.findByIdAndUpdate(userId, { $pull: { likedSongs: songId } });
      res.json({ success: true, message: "Unliked", isLiked: false });
    } else {
      // Nếu chưa like -> Like (AddToSet)
      await User.findByIdAndUpdate(userId, { $addToSet: { likedSongs: songId } });
      res.json({ success: true, message: "Liked", isLiked: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. API Toggle Follow Artist (Theo dõi/Bỏ theo dõi nghệ sĩ)
const toggleFollowArtist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { artistId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isFollowing = user.followedArtists.some(id => id.toString() === artistId);

    if (isFollowing) {
      // --- UNFOLLOW ---
      // 1. Xóa artistId khỏi user
      await User.findByIdAndUpdate(userId, { $pull: { followedArtists: artistId } });
      // 2. Giảm followersCount của Artist
      await Artist.findByIdAndUpdate(artistId, { $inc: { followersCount: -1 } });
      
      res.json({ success: true, message: "Unfollowed", isFollowing: false });
    } else {
      // --- FOLLOW ---
      // 1. Thêm artistId vào user
      await User.findByIdAndUpdate(userId, { $addToSet: { followedArtists: artistId } });
      // 2. Tăng followersCount của Artist
      await Artist.findByIdAndUpdate(artistId, { $inc: { followersCount: 1 } });

      res.json({ success: true, message: "Followed", isFollowing: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

 const getLikedSongs = async (req, res) => {
  try {
    const userId = req.user.id; // Lấy ID từ token (middleware protect)

    // Tìm user và POPULATE trường likedSongs
    // select('likedSongs') để chỉ lấy trường này cho nhẹ
    // populate('likedSongs') sẽ biến mảng ID thành mảng Object bài hát chi tiết
    const user = await User.findById(userId)
      .select("likedSongs")
      .populate({
        path: "likedSongs",
        select: "title artist imageUrl audioUrl duration", // Chỉ lấy các trường cần thiết
      });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Trả về danh sách bài hát (đảo ngược để bài mới thích lên đầu)
    const songs = user.likedSongs.reverse();

    res.status(200).json({
      success: true,
      count: songs.length,
      songs: songs,
    });
  } catch (error) {
    console.error("Get Liked Songs Error:", error);
    res.status(500).json({ success: false, message: "Lỗi Server" });
  }
};

// --- CẬP NHẬT HỒ SƠ ---
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    // Dữ liệu text nằm trong req.body
    const { username, gender } = req.body;

    const updateData = {};
    if (username) updateData.username = username;
    if (gender) updateData.gender = gender;

    // QUAN TRỌNG: Nếu có file ảnh upload thành công, Cloudinary trả link về req.file.path
    if (req.file && req.file.path) {
      updateData.avatar = req.file.path;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Cập nhật hồ sơ thành công",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ success: false, message: "Lỗi Server" });
  }
};
  
export { getUserDetail, toggleLikeSong, toggleFollowArtist, getLikedSongs, updateUserProfile  };