import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true }, 
    image: { type: String, required: true },
    color: { type: String, default: "#000000" } 
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);
export default Category;