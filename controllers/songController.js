import Song from '../models/Songs.js';
import {v2 as cloudinary} from 'cloudinary';

const addSong = async (req, res) => {
    try {

        const name = req.body.name;
        const desc = req.body.desc;
        const album = req.body.album;
        const audioFile = req.files.audio[0];
        const imageFile = req.files.image[0];

        // 1. upload file len cloudinary
        const audioUpload = await cloudinary.uploader.upload(audioFile.path, {resource_type: "video"});
        const imageUpload = await cloudinary.uploader.upload(imageFile.path, {resource_type: "image"});

        // 2. tinh toan thoi gian (lay duration tu Cloudinary tra ve)
        const duration = Math.floor(audioUpload.duration);

        // 3. tao data de luu vao MongoDB
        const newSong = new Song({
            title: name,
            description: desc,
            audioUrl: audioUpload.secure_url,
            imageUrl: imageUpload.secure_url,
            duration: duration,
            album: album !== "none" ? album : undefined
        })

        await newSong.save();

        res.json({success: true, message: "Đã thêm bài hát thành công!"});

    }catch (error) {
        console.log(error);
        res.json({success: false, message: "Lỗi thêm bài hát"});
    }
}

const removeSong = async (req, res) => {
    try {

        // 1. Tìm bài hát trong db
        const song = await Song.findById(req.body.id);

        if(!song) {
            return res.json({sucess: flase, message: "Không tìm thấy bài hát"});
        }

        // 2. Xóa bài hát trên Cloudinary
        // Logic: lấy public_id từ URL.,
        // URL mẫu: https://res.cloudinary.com/.../upload/v1234/spotify/ten-anh
        // Ta cần lấy đoạn: "spotify/ten-anh"

        if(song.imageUrl) {
            const imagePublicId = song.imageUrl.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(imagePublicId, {resource_type: "image"});
        } 

        // 3. Xóa nhạc trên cloudinary
        if(song.audioUrl) {
            const audioPublicId = song.audioUrl.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(audioPublicId, {resource_type: "video"});
        }

        await Song.findByIdAndDelete(req.body.id);

        res.json({success: true, message: "Đã xóa bài hát thành công"});

    }catch (error) {
        console.log(error);
        res.json({success: false, message: "Lỗi xóa bài hát"});
    }
}

const listSong = async (req, res) => {
    try {

        const allSongs = await Song.find({});
        res.json({success: true, songs: allSongs });

    }catch (error) {
        res.json({success:false, message: "Lỗi lấy danh sách bài hát"});
    }
}

export { addSong, listSong , removeSong};