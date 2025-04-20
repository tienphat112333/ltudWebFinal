const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));  // Serve images from 'uploads' folder

// Kết nối MongoDB và khởi động server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Đã kết nối MongoDB');
    app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));
  })
  .catch((err) => console.error('Lỗi kết nối MongoDB:', err));

// Mongoose model
const productSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  material: { type: String, required: true },
  color: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  image: { type: String, required: true },
  brand: { type: String, required: true }  // thương hiệu
});

const Product = mongoose.model('Product', productSchema);

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + Date.now() + ext;
    cb(null, filename);
  }
});
const upload = multer({ storage });

// Routes
// Lấy tất cả sản phẩm
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Không lấy được sản phẩm' });
  }
});

// Thêm mới sản phẩm
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { id, name, material, color, price, brand } = req.body;
    const image = req.file ? req.file.path : null;
    const newProduct = new Product({
      id,
      name,
      material,
      color,
      price,
      image,
      brand
    });
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (err) {
    res.status(500).json({ error: 'Không thêm được sản phẩm' });
  }
});

// Sửa sản phẩm (bao gồm cả việc cập nhật hình ảnh)
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, material, color, price, brand } = req.body;
  const image = req.file ? req.file.path : req.body.image;  // Nếu có hình ảnh mới, cập nhật nó

  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { name, material, color, price, brand, image },
      { new: true }
    );
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ error: 'Không sửa được sản phẩm' });
  }
});

// Xóa sản phẩm
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await Product.findByIdAndDelete(id);
    res.status(204).send();  // Thành công không có nội dung trả về
  } catch (err) {
    res.status(500).json({ error: 'Không xóa được sản phẩm' });
  }
});

