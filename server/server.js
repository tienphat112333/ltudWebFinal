const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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

// Mongoose model cho sản phẩm
const productSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  material: { type: String, required: true },
  color: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  image: { type: String, required: true },
  brand: { type: String, required: true },
  category: { type: String, required: true } // NEW
});
// Mongoose model cho Counter 
// Để quản lý ID tự động tăng cho các sản phẩm
const counterSchema = new mongoose.Schema({
  _id: String, // "SO", "CH", ...
  seq: { type: Number, default: 0 },
});
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email là bắt buộc'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email không hợp lệ']
  },
  password: {
    type: String,
    required: [true, 'Mật khẩu là bắt buộc'],
    minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự']
  }
});
const Product = mongoose.model('Product', productSchema);
const Counter = mongoose.model('Counter', counterSchema);
const User = mongoose.model('User', userSchema);

// Hàm tạo ID
async function generateProductId(categoryCode, isForReservation = true) {
  const counter = await Counter.findByIdAndUpdate(
    categoryCode,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  if (!isForReservation) {
    await Counter.findByIdAndUpdate(
      categoryCode,
      { $inc: { seq: -1 } },
      { new: true }
    );
  }

  return `FURN${categoryCode}${counter.seq.toString().padStart(4, '0')}`;
}
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
// Route để tạo ID cho sản phẩm 
app.post('/api/products/generate-id', async (req, res) => {
  const { category } = req.body;

  try {
    const counter = await Counter.findOne({ _id: category });
    const currentSeq = counter ? counter.seq : 0;
    const newId = `FURN${category}${(currentSeq + 1).toString().padStart(4, '0')}`;

    res.json({ id: newId });
  } catch (err) {
    console.error("Lỗi khi tạo ID:", err);
    res.status(500).json({ error: 'Không thể tạo ID cho sản phẩm' });
  }
});
// Lấy tất cả sản phẩm
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Không lấy được sản phẩm' });
  }
});

// Thêm mới sản phẩm (sử dụng counter thực sự)
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, material, color, price, brand, category } = req.body;
    const image = req.file ? req.file.path : null;

    // Tạo ID mới với isForReservation = true (tăng counter thực sự)
    const id = await generateProductId(category, true);

    const newProduct = new Product({
      id,
      name,
      material,
      color,
      price,
      image,
      brand,
      category
    });

    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (err) {
    res.status(500).json({ error: 'Không thêm được sản phẩm' });
  }
});

// Sửa sản phẩm 
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      name: req.body.name,
      material: req.body.material,
      color: req.body.color,
      price: req.body.price,
      brand: req.body.brand
    };

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    if (!updatedProduct) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ error: 'Không cập nhật được sản phẩm' });
  }
});

// Xóa sản phẩm
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Tìm sản phẩm để lấy đường dẫn ảnh trước khi xóa
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }
    // Xóa sản phẩm từ database
    await Product.findByIdAndDelete(id);
    // Xóa file ảnh từ server (tuỳ chọn)
    if (product.image) {
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, product.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Không xóa được sản phẩm' });
  }
});

// Tìm kiếm sản phẩm theo bộ lọc
app.get('/api/products/search', async (req, res) => {
  try {
    const { name, color, material, brand, minPrice, maxPrice } = req.query;

    const query = {};

    if (name) {
      query.name = { $regex: name, $options: 'i' }; // không phân biệt hoa thường
    }
    if (color) {
      query.color = { $regex: color, $options: 'i' };
    }
    if (material) {
      query.material = { $regex: material, $options: 'i' };
    }
    if (brand) {
      query.brand = { $regex: brand, $options: 'i' };
    }
    if (minPrice) {
      query.price = { ...query.price, $gte: parseFloat(minPrice) };
    }
    if (maxPrice) {
      query.price = { ...query.price, $lte: parseFloat(maxPrice) };
    }

    const products = await Product.find(query);
    res.json(products);
  } catch (err) {
    console.error('Lỗi khi tìm kiếm sản phẩm:', err);
    res.status(500).json({ error: 'Không tìm kiếm được sản phẩm' });
  }
});

// Đăng ký
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Vui lòng cung cấp email và mật khẩu" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự" });
    }

    // Check existing user
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email đã tồn tại" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      email,
      password: hashed
    });
    await user.save();

    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (err) {
    console.error("Lỗi đăng ký:", err);
    res.status(500).json({ error: "Lỗi server khi đăng ký" });
  }
});

// Đăng nhập
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Email không tồn tại" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Sai mật khẩu" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error("Lỗi đăng nhập:", err);
    res.status(500).json({ error: "Lỗi đăng nhập" });
  }
});
