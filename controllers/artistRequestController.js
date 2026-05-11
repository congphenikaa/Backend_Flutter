import ArtistRequest from '../models/ArtistRequest.js';
import User from '../models/User.js';

export const submitRequest = async (req, res) => {
    try {
        const { stageName, socialLink } = req.body;

        if (!stageName) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên nghệ danh (stageName).' });
        }

        const existing = await ArtistRequest.findOne({ user: req.user._id, status: 'pending' });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Bạn đã có một yêu cầu đang chờ. Vui lòng đợi phản hồi.' });
        }

        const request = new ArtistRequest({ user: req.user._id, stageName, socialLink });
        await request.save();

        return res.status(201).json({ success: true, data: request });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
};

export const getAllRequests = async (req, res) => {
    try {
        const requests = await ArtistRequest.find()
            .populate('user', 'username email avatar')
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: requests });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
};

export const approveRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await ArtistRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: 'Yêu cầu không tồn tại.' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Yêu cầu đã được xử lý trước đó.' });
        }

        request.status = 'approved';

        const user = await User.findById(request.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Người dùng liên kết không tồn tại.' });
        }

        user.role = 'artist';

        await user.save();
        await request.save();

        return res.status(200).json({ success: true, data: request });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
};

export const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await ArtistRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: 'Yêu cầu không tồn tại.' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Yêu cầu đã được xử lý trước đó.' });
        }

        request.status = 'rejected';
        await request.save();

        return res.status(200).json({ success: true, data: request });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
};
