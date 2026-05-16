import ArtistRequest from "../models/ArtistRequest.js";     
import User from "../models/User.js";
import Artist from "../models/Artist.js";

// 1. User gửi đơn đề xuất
export const createRequest = async (req, res) => {
    try {
        const { artistName, bio, genre, socialLinks, reason } = req.body;

        // Kiểm tra xem user đã có đơn pending chưa
        const existingRequest = await ArtistRequest.findOne({
            user: req.user._id,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: "Bạn đã có đơn đang chờ duyệt. Vui lòng đợi kết quả."
            });
        }

        const request = await ArtistRequest.create({
            user: req.user._id,
            artistName,
            bio,
            genre,
            socialLinks,
            reason
        });

        res.status(201).json({
            success: true,
            message: "Gửi đơn thành công. Vui lòng chờ admin duyệt.",
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. User xem đơn của mình
export const getMyRequest = async (req, res) => {
    try {
        const request = await ArtistRequest.findOne({ user: req.user._id })
            .sort({ createdAt: -1 });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Bạn chưa gửi đơn đề xuất nào."
            });
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Admin lấy danh sách đơn (có thể lọc theo status)
export const getAllRequests = async (req, res) => {
    try {
        const { status } = req.query;

        let filter = {};
        if (status) filter.status = status;

        const requests = await ArtistRequest.find(filter)
            .populate('user', 'username email avatar')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Admin duyệt đơn
export const approveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        const request = await ArtistRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: "Đơn này đã được xử lý" });
        }

        // 1. Cập nhật trạng thái đơn
        request.status = 'approved';
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        if (adminNote) request.adminNote = adminNote;
        await request.save();

        // 2. Cập nhật role user thành artist
        const user = await User.findById(request.user);
        if (user && user.role !== 'artist') {
            user.role = 'artist';
            await user.save();
        }

        // 3. Tạo hoặc cập nhật hồ sơ Artist
        let artist = await Artist.findOne({ userId: request.user });

        if (!artist) {
            // Tạo mới
            artist = await Artist.create({
                userId: request.user,
                name: request.artistName || (user ? user.username : "Artist"),
                image: user?.avatar || "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
                bio: request.bio || "Nghệ sĩ mới trên nền tảng",
                isVerified: false
            });
            console.log("Đã tạo mới hồ sơ Artist:", artist.name);
        } else {
            // Nếu đã có thì cập nhật thông tin từ đơn (tùy chọn)
            artist.name = request.artistName || artist.name;
            artist.bio = request.bio || artist.bio;
            await artist.save();
            console.log("Đã cập nhật hồ sơ Artist:", artist.name);
        }

        res.status(200).json({
            success: true,
            message: "Đã duyệt đơn và tạo/cập nhật hồ sơ Artist thành công"
        });
    } catch (error) {
        console.error("Approve Request Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
// 5. Admin từ chối đơn
export const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        const request = await ArtistRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: "Đơn này đã được xử lý" });
        }

        request.status = 'rejected';
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        if (adminNote) request.adminNote = adminNote;
        await request.save();

        res.status(200).json({
            success: true,
            message: "Đã từ chối đơn"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Hủy đơn (chỉ user chủ đơn mới được hủy, và chỉ khi đang pending)
export const cancelRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await ArtistRequest.findById(id);

        if (!request) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
        }

        // Kiểm tra quyền: Chỉ chủ đơn mới được hủy
        if (request.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền hủy đơn này" });
        }

        // Chỉ cho phép hủy khi đang pending
        if (request.status !== 'pending') {
            return res.status(400).json({ 
                success: false, 
                message: "Chỉ được hủy đơn khi đang ở trạng thái chờ duyệt" 
            });
        }

        await ArtistRequest.findByIdAndDelete(id);

        res.status(200).json({ 
            success: true, 
            message: "Đã hủy đơn đề xuất thành công" 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};