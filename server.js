const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'chuoibimat_sieucap_123456'; 

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Chỉ giữ lại một đoạn app.listen duy nhất ở CUỐI FILE server.js
// Đừng để nó ở đầu file như thế này nhé!

const API_KEY = "5e1aa4c8a5233323b385033461164a51QvqRLcbi8IomTaEhZsnD6UtX2FjJNAHp";
const BASE_URL = "https://mailedus.com/api";

const mongoURI = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/api_store';
mongoose.connect(mongoURI);
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' },
    role: { type: String, default: 'user' },
    balance: { type: Number, default: 0 },
    totalDeposit: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    trans_id: String, productName: String, price: Number, originalPrice: Number, accounts: String,
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const settingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true }
});
const Setting = mongoose.model('Setting', settingSchema);

async function getMarkup() {
    let s = await Setting.findOne({ key: 'markup_percent' });
    if (!s) { s = new Setting({ key: 'markup_percent', value: 20 }); await s.save(); }
    return s.value;
}

// --- MIDDLEWARES ---
const auth = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ status: "error", msg: "Vui lòng đăng nhập!" });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ status: "error", msg: "Phiên hết hạn!" });
        req.user = decoded; next();
    });
};

const adminOnly = async (req, res, next) => {
    const u = await User.findById(req.user.id);
    if (u && u.role === 'admin') next();
    else res.status(403).json({ status: "error", msg: "Quyền Admin bị từ chối!" });
};

// --- API ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        // Bóc tách dữ liệu từ body
        const { username, password, email, phone } = req.body;

        // Kiểm tra xem có dữ liệu nào bị trống không
        if (!username || !password || !email || !phone) {
            return res.status(400).json({ 
                status: "error", 
                msg: "Vui lòng nhập đầy đủ: Tài khoản, Mật khẩu, Email và Số điện thoại!" 
            });
        }

        // Kiểm tra tài khoản tồn tại
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ status: "error", msg: "Tài khoản đã tồn tại!" });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Lưu vào database
        const newUser = new User({ 
            username, 
            password: hashedPassword, 
            email, 
            phone 
        });
        
        await newUser.save();
        res.json({ status: "success", msg: "Đăng ký thành công!" });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ status: "error", msg: "Lỗi hệ thống khi đăng ký" }); 
    }
});

app.post('/api/login', async (req, res) => {
    const u = await User.findOne({ username: req.body.username });
    if (!u || !(await bcrypt.compare(req.body.password, u.password))) return res.status(400).json({ status: "error", msg: "Sai thông tin!" });
    res.json({ status: "success", token: jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: '24h' }) });
});

app.get('/api/me', auth, async (req, res) => {
    res.json({ status: "success", data: await User.findById(req.user.id).select('-password') });
});

app.get('/api/forward', async (req, res) => {
    const { type, id } = req.query;
    let url = type === 'products' ? `${BASE_URL}/products.php?api_key=${API_KEY}` : `${BASE_URL}/order.php?api_key=${API_KEY}&order=${id}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (type === 'products' && data.status === "success" && data.categories) {
            const markup = await getMarkup();
            const multiplier = 1 + (markup / 100);

            data.categories.forEach(cat => {
                if (cat.products) {
                    cat.products.forEach(prod => {
                        // Giữ nguyên prod.amount từ API gốc
                        prod.price = Math.ceil(Number(prod.price) * multiplier);
                    });
                }
            });
        }
        res.json(data);
    } catch (error) { res.status(500).json({ error: "Lỗi API" }); }
});

app.post('/api/buy', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const prodData = await (await fetch(`${BASE_URL}/products.php?api_key=${API_KEY}`)).json();
        let target = null;
        prodData.categories.forEach(c => { const p = c.products.find(x => x.id == req.body.id); if(p) target = p; });
        if (!target) return res.status(400).json({ status: "error", msg: "Không thấy sản phẩm!" });

        const m = await getMarkup();
        const cost = Number(target.price);
        const retail = Math.ceil(cost * (1 + m/100));

        if (user.balance < retailPrice) {
    return res.status(400).json({ 
        status: "error", 
        // SỬA DÒNG DƯỚI ĐÂY:
        msg: "Sản phẩm đang bảo trì hoặc tạm hết hàng. Vui lòng liên hệ Admin để được xử lý ngay!" 
    });
}

        const p = new URLSearchParams(); p.append('action', 'buyProduct'); p.append('id', req.body.id); p.append('amount', 1); p.append('api_key', API_KEY);
        const r = await fetch('https://mailedus.com/api/buy_product', { method: 'POST', body: p });
        const d = await r.json();

        if (d.status === "success") {
            user.balance -= retail; await user.save();
            await new Order({ userId: user._id, trans_id: d.trans_id, productName: target.name, price: retail, originalPrice: cost, accounts: d.data?.join('\n') }).save();
        }
        res.json(d);
    } catch (e) { res.status(500).json({ status: "error", msg: "Lỗi giao dịch" }); }
});

app.get('/api/history', auth, async (req, res) => {
    res.json({ status: "success", data: await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }) });
});

// --- ADMIN API ---
app.get('/api/admin/dashboard', auth, adminOnly, async (req, res) => {
    try {
        // Lấy tất cả đơn hàng và nạp thông tin username của người mua
        const orders = await Order.find().populate('userId', 'username').sort({ createdAt: -1 });
        
        let rev = 0, cost = 0;
        
        const data = orders.map(o => {
            const retail = Number(o.price) || 0;
            // Nếu đơn hàng cũ không có giá gốc (originalPrice), coi như bằng giá bán (lãi = 0)
            const oPrice = Number(o.originalPrice) || retail; 
            const profit = retail - oPrice;

            rev += retail; 
            cost += oPrice;

            return { 
                username: o.userId?.username || 'Khách ẩn danh', 
                productName: o.productName || 'Sản phẩm không tên', 
                price: retail, 
                cost: oPrice, 
                profit: profit, 
                createdAt: o.createdAt 
            };
        });

        res.json({ 
            status: "success", 
            metrics: { 
                totalOrders: orders.length, 
                rev: rev, 
                cost: cost, 
                profit: rev - cost 
            }, 
            orders: data 
        });
    } catch (error) { 
        console.error("Lỗi Dashboard:", error);
        res.status(500).json({ status: "error", msg: "Lỗi tính toán dữ liệu" }); 
    }
});

app.post('/api/admin/topup', auth, adminOnly, async (req, res) => {
    const u = await User.findById(req.body.targetUserId);
    const amt = Number(req.body.amount);
    u.balance += amt; u.totalDeposit += amt;
    await u.save();
    res.json({ status: "success", msg: "Nạp tiền thành công!" });
});

app.get('/api/admin/settings', auth, adminOnly, async (req, res) => {
    res.json({ status: "success", markup: await getMarkup() });
});

app.put('/api/admin/settings', auth, adminOnly, async (req, res) => {
    await Setting.findOneAndUpdate({ key: 'markup_percent' }, { value: req.body.markup }, { upsert: true });
    res.json({ status: "success", msg: "Đã lưu cài đặt!" });
});

app.get('/api/admin/dashboard', auth, adminOnly, async (req, res) => {
    try {
        // Lấy tất cả đơn hàng, nếu không có userId thì vẫn lấy đơn hàng đó (không dùng populate nếu gây lỗi)
        const orders = await Order.find().sort({ createdAt: -1 }).lean();
        
        // Lấy danh sách user để đối chiếu thủ công (an toàn hơn populate trong một số trường hợp)
        const allUsers = await User.find({}, 'username').lean();
        const userMap = {};
        allUsers.forEach(u => userMap[u._id.toString()] = u.username);

        let rev = 0;
        let cost = 0;
        
        const data = orders.map(o => {
            // Chuyển đổi sang số để đảm bảo phép cộng chuẩn xác
            const retail = Number(o.price || 0);
            const original = Number(o.originalPrice || retail); 
            const profit = retail - original;

            rev += retail; 
            cost += original;

            return { 
                username: userMap[o.userId?.toString()] || 'Khách ẩn danh', 
                productName: o.productName || 'Sản phẩm lỗi tên', 
                price: retail, 
                cost: original, 
                profit: profit, 
                createdAt: o.createdAt 
            };
        });

        console.log(`📊 Thống kê: Đơn: ${orders.length} | Doanh thu: ${rev} | Vốn: ${cost}`);

        res.json({ 
            status: "success", 
            metrics: { 
                totalOrders: orders.length, 
                rev: rev, 
                cost: cost, 
                profit: rev - cost 
            }, 
            orders: data 
        });
    } catch (error) { 
        console.error("❌ Lỗi Dashboard Admin:", error);
        res.status(500).json({ status: "error", msg: error.message }); 
    }
});
// ============================================================
// --- CỤM API DÀNH RIÊNG CHO ADMIN (QUẢN LÝ HỆ THỐNG) ---
// ============================================================

// 1. API Lấy danh sách thành viên (Dùng cho bảng Quản lý User)
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ status: "success", data: users });
    } catch (e) {
        res.status(500).json({ status: "error", msg: "Lỗi tải danh sách thành viên" });
    }
});

// 2. API Nạp tiền cho User (Cập nhật cả số dư và Tổng nạp)
app.post('/api/admin/topup', auth, adminOnly, async (req, res) => {
    try {
        const u = await User.findById(req.body.targetUserId);
        if (!u) return res.status(404).json({ status: "error", msg: "Không tìm thấy người dùng!" });

        const amt = Number(req.body.amount);
        if (isNaN(amt) || amt <= 0) return res.status(400).json({ status: "error", msg: "Số tiền không hợp lệ!" });

        u.balance += amt; 
        u.totalDeposit = (u.totalDeposit || 0) + amt; // Lưu lại dấu vết tổng tiền đã nạp
        await u.save();

        res.json({ status: "success", msg: `Đã nạp ${amt.toLocaleString()}đ thành công!` });
    } catch (e) {
        res.status(500).json({ status: "error", msg: "Lỗi nạp tiền hệ thống" });
    }
});

// 3. API Lấy cấu hình % lợi nhuận
app.get('/api/admin/settings', auth, adminOnly, async (req, res) => {
    try {
        const markup = await getMarkup();
        res.json({ status: "success", markup });
    } catch (e) {
        res.status(500).json({ status: "error", msg: "Lỗi tải cài đặt" });
    }
});

// 4. API Cập nhật % lợi nhuận
app.put('/api/admin/settings', auth, adminOnly, async (req, res) => {
    try {
        const val = Number(req.body.markup);
        await Setting.findOneAndUpdate({ key: 'markup_percent' }, { value: val }, { upsert: true });
        res.json({ status: "success", msg: "Đã lưu thay đổi lợi nhuận!" });
    } catch (e) {
        res.status(500).json({ status: "error", msg: "Lỗi lưu cài đặt" });
    }
});

// 5. API Thống kê Dashboard (Doanh thu, Vốn, Lãi)
app.get('/api/admin/dashboard', auth, adminOnly, async (req, res) => {
    try {
        const orders = await Order.find().populate('userId', 'username').sort({ createdAt: -1 }).lean();
        let rev = 0, cost = 0;
        
        const data = orders.map(o => {
            const retail = Number(o.price) || 0;
            const original = Number(o.originalPrice) || retail;
            rev += retail; cost += original;
            return {
                username: o.userId?.username || 'Khách ẩn danh',
                productName: o.productName,
                price: retail,
                cost: original,
                profit: retail - original,
                createdAt: o.createdAt
            };
        });

        res.json({ 
            status: "success", 
            metrics: { totalOrders: orders.length, rev, cost, profit: rev - cost }, 
            orders: data 
        });
    } catch (e) {
        res.status(500).json({ status: "error", msg: "Lỗi thống kê dữ liệu" });
    }
});

// --- DÒNG NÀY PHẢI LUÔN NẰM DƯỚI CÙNG ---
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`Server is running on port ${PORT}`); 
});