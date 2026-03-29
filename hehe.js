const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000; // Sửa để chạy được trên GitHub/Render

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = './database.json';
const ADMIN_PASSWORD = 'admin'; 
const GEMINI_KEY = 'AIzaSyCEwd9Tr-j14tLxgt8WaiCQdgEnc-WiTHE'; 

// ==============================================
// SERVER KEY DÙNG CHUNG CHO BƯỚC 1
// ==============================================
const MASTER_SERVER_KEY = 'LVT-SERVER-PRO'; 

function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return {}; }
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ==============================================
// MIDDLEWARE BẢO MẬT TRANG ADMIN
// ==============================================
app.use((req, res, next) => {
    if (req.path === '/api/check' || req.path === '/api/ai' || req.path === '/login') return next();
    const cookies = req.headers.cookie || '';
    if (cookies.includes('admin_auth=true')) return next();
    res.redirect('/login');
});

// ==============================================
// CHỨC NĂNG ĐĂNG NHẬP (GIAO DIỆN SIÊU ĐẸP)
// ==============================================
app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Đăng nhập Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; background: url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop') center/cover no-repeat; height: 100vh; display: flex; align-items: center; justify-content: center; }
            .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px); z-index: 1; }
            .login-card { position: relative; z-index: 2; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(15px); padding: 40px; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); width: 320px; text-align: center; }
            .login-card h2 { color: #fff; margin-top: 0; margin-bottom: 30px; letter-spacing: 2px; font-weight: 900; text-shadow: 0 0 10px rgba(0,255,255,0.5); }
            .login-card input { width: 100%; padding: 15px; margin-bottom: 25px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(0,255,255,0.3); outline: none; border-radius: 30px; color: #0ff; font-size: 16px; box-sizing: border-box; text-align: center; transition: 0.3s; }
            .login-card input:focus { border-color: #0ff; box-shadow: 0 0 15px rgba(0,255,204,0.4); background: rgba(0,0,0,0.6); }
            .login-card button { width: 100%; padding: 15px; background: linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%); color: #fff; font-weight: bold; border: none; border-radius: 30px; cursor: pointer; font-size: 16px; transition: 0.3s; box-shadow: 0 5px 15px rgba(0, 210, 255, 0.4); text-transform: uppercase; }
        </style>
    </head>
    <body>
        <div class="overlay"></div>
        <div class="login-card">
            <h2>LVT ADMIN PRO</h2>
            <form action="/login" method="POST">
                <input type="password" name="password" placeholder="Mật khẩu quản trị..." required autocomplete="off">
                <button type="submit">Xác nhận vào hệ thống</button>
            </form>
        </div>
    </body>
    </html>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', 'admin_auth=true; Max-Age=86400; HttpOnly; Path=/');
        res.redirect('/');
    } else {
        res.send('<script>alert("Mật khẩu không chính xác!"); window.location="/login";</script>');
    }
});

app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'admin_auth=; Max-Age=0; HttpOnly; Path=/');
    res.redirect('/login');
});

// ==============================================
// 1. API CHECK KEY
// ==============================================
app.post('/api/check', (req, res) => {
    const { key, deviceId } = req.body;
    if (key === MASTER_SERVER_KEY) return res.json({ status: 'success', key: key, exp: 'permanent', devices: '∞/∞' });
    let db = loadDB();
    if (!db[key]) return res.json({ status: 'error', message: 'Key không tồn tại!' });
    let kd = db[key];
    if (kd.status === 'banned') return res.json({ status: 'error', message: 'Key đã bị khóa!' });
    if (kd.exp === 'pending') { kd.exp = Date.now() + kd.durationMs; saveDB(db); }
    if (kd.exp !== 'permanent' && Date.now() > kd.exp) return res.json({ status: 'error', message: 'Key đã hết hạn!' });
    if (!kd.devices.includes(deviceId)) {
        if (kd.devices.length >= kd.maxDevices) return res.json({ status: 'error', message: 'Hết lượt thiết bị!' });
        kd.devices.push(deviceId); saveDB(db);
    }
    res.json({ status: 'success', key: key, exp: kd.exp, devices: `${kd.devices.length}/${kd.maxDevices}` });
});

// ==============================================
// 2. API TRỢ LÝ AI
// ==============================================
app.post('/api/ai', async (req, res) => {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: req.body.prompt }] }] })
        });
        const data = await response.json();
        res.json({ status: 'success', text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Lỗi AI" });
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// ==============================================
// 3. QUẢN TRỊ & BUILDER
// ==============================================
app.post('/admin/create', (req, res) => {
    let { duration, type, maxDevices, quantity, keyPrefix } = req.body;
    let db = loadDB();
    let prefix = keyPrefix === 'VIP' ? 'VIP-' : 'LVT-';
    for (let i = 0; i < (parseInt(quantity) || 1); i++) {
        const nk = `${prefix}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        let m = { 'sec': 1000, 'min': 60000, 'hour': 3600000, 'day': 86400000, 'month': 2592000000, 'year': 31536000000 };
        db[nk] = { exp: type === 'permanent' ? 'permanent' : 'pending', durationMs: type !== 'permanent' ? parseInt(duration) * (m[type] || 0) : 0, maxDevices: parseInt(maxDevices), devices: [], status: 'active' };
    }
    saveDB(db); res.redirect('/');
});

app.get('/admin/reset-device/:key', (req, res) => { let db = loadDB(); if(db[req.params.key]){ db[req.params.key].devices = []; saveDB(db); } res.redirect('/'); });
app.get('/admin/reset-time/:key', (req, res) => { let db = loadDB(); if(db[req.params.key] && db[req.params.key].exp !== 'permanent'){ db[req.params.key].exp = 'pending'; saveDB(db); } res.redirect('/'); });
app.get('/admin/delete/:key', (req, res) => { let db = loadDB(); delete db[req.params.key]; saveDB(db); res.redirect('/'); });
app.post('/admin/delete-bulk', (req, res) => {
    let { deleteType } = req.body; let db = loadDB();
    for (let k in db) { if (deleteType === 'all' || (deleteType === 'expired' && db[k].exp !== 'permanent' && db[k].exp !== 'pending' && Date.now() > db[k].exp)) delete db[k]; }
    saveDB(db); res.redirect('/');
});

app.get('/', (req, res) => {
    let db = loadDB(); let keysHtml = '';
    for (let k in db) {
        let kd = db[k]; let isVip = k.startsWith('VIP-');
        let expT = kd.exp === 'pending' ? '<span style="color:#007bff;">Chờ kích hoạt</span>' : (kd.exp === 'permanent' ? 'Vĩnh viễn' : new Date(kd.exp).toLocaleString());
        keysHtml += `<tr style="${isVip ? 'background:#fffbf0;' : ''}"><td><strong style="color:${isVip ? '#f39c12' : '#333'}">${k}</strong></td><td>${expT}</td><td>${kd.devices.length}/${kd.maxDevices} <a href="/admin/reset-device/${k}">[Reset HWID]</a></td><td><a href="/admin/reset-time/${k}">[Reset TG]</a> | <a href="/admin/delete/${k}">[Xóa]</a></td></tr>`;
    }
    res.send(`<!DOCTYPE html><html><head><title>LVT Panel</title><style>body{font-family:Arial;padding:20px;background:#f4f4f9;} .card{background:#fff;padding:20px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.1);margin-bottom:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:10px;text-align:left;} input,select,textarea{padding:8px;margin:5px;}</style></head>
    <body>
        <div style="display:flex;justify-content:space-between;align-items:center;"><h1>LVT ADMIN ECOSYSTEM</h1><a href="/logout">Đăng xuất</a></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div class="card"><h2>1. Tạo Key</h2>
                <form action="/admin/create" method="POST">
                    <select name="keyPrefix"><option value="LVT">Thường</option><option value="VIP">VIP</option></select>
                    <input type="number" name="duration" placeholder="TG" required>
                    <select name="type"><option value="day">Ngày</option><option value="permanent">Vĩnh viễn</option></select>
                    Thiết bị: <input type="number" name="maxDevices" value="1" style="width:40px;">
                    <button type="submit">TẠO</button>
                </form>
            </div>
            <div class="card"><h2>2. Bọc Script</h2>
                <textarea id="b-code" placeholder="Dán code gốc..." style="width:100%;height:60px;"></textarea>
                <button onclick="build()">BỌC</button>
                <textarea id="b-final" readonly style="width:100%;height:40px;background:#eee;"></textarea>
            </div>
        </div>
        <div class="card"><h2>3. Danh sách Key</h2>
            <form action="/admin/delete-bulk" method="POST"><select name="deleteType"><option value="expired">Xóa hết hạn</option><option value="all">Xóa tất cả</option></select><button type="submit">Xóa hàng loạt</button></form><br>
            <table><tr><th>Key</th><th>Hết hạn</th><th>Thiết bị</th><th>Hành động</th></tr>${keysHtml}</table>
        </div>
        <script>function build(){let c=document.getElementById('b-code').value; if(!c)return; document.getElementById('b-final').value="eval(atob('"+btoa(unescape(encodeURIComponent(c)))+"'))";}</script>
    </body></html>`);
});

app.listen(port, () => { console.log('Server Live'); });
