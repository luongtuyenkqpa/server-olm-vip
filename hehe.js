const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = './database.json';
const ADMIN_PASSWORD = 'admin'; 
const GEMINI_KEY = 'AIzaSyCEwd9Tr-j14tLxgt8WaiCQdgEnc-WiTHE'; 
const MASTER_SERVER_KEY = 'LVT-SERVER-PRO'; 

function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return {}; }
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Security Middleware
app.use((req, res, next) => {
    if (req.path === '/api/check' || req.path === '/api/ai' || req.path === '/login') return next();
    const cookies = req.headers.cookie || '';
    if (cookies.includes('admin_auth=true')) return next();
    res.redirect('/login');
});

// GIAO DIỆN LOGIN GỐC (GLASSMORPHISM)
app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Login Admin</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background: url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop') center/cover no-repeat; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-card { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(15px); padding: 40px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.2); width: 320px; text-align: center; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        input { width: 100%; padding: 15px; margin: 20px 0; background: rgba(0,0,0,0.3); border: 1px solid #0ff; border-radius: 30px; color: #0ff; text-align: center; outline: none; box-sizing: border-box; font-weight: bold;}
        button { width: 100%; padding: 15px; background: linear-gradient(90deg, #00d2ff, #3a7bd5); color: #fff; border: none; border-radius: 30px; cursor: pointer; font-weight: bold; text-transform: uppercase; }
    </style></head>
    <body><div class="login-card"><h2>LVT ADMIN PRO</h2><form action="/login" method="POST"><input type="password" name="password" placeholder="MẬT KHẨU..." required><button type="submit">Vào hệ thống</button></form></div></body></html>`);
});

app.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', 'admin_auth=true; Max-Age=86400; HttpOnly; Path=/');
        res.redirect('/');
    } else res.send('<script>alert("Sai!"); window.location="/login";</script>');
});

app.get('/logout', (req, res) => { res.setHeader('Set-Cookie', 'admin_auth=; Max-Age=0; HttpOnly; Path=/'); res.redirect('/login'); });

// API CORE
app.post('/api/check', (req, res) => {
    const { key, deviceId } = req.body;
    if (key === MASTER_SERVER_KEY) return res.json({ status: 'success', key: key, exp: 'permanent', devices: '∞/∞' });
    let db = loadDB();
    if (!db[key]) return res.json({ status: 'error', message: 'Key không tồn tại!' });
    let kd = db[key];
    if (kd.status === 'banned') return res.json({ status: 'error', message: 'Key bị khóa!' });
    if (kd.exp === 'pending') { kd.exp = Date.now() + kd.durationMs; saveDB(db); }
    if (kd.exp !== 'permanent' && Date.now() > kd.exp) return res.json({ status: 'error', message: 'Hết hạn!' });
    if (!kd.devices.includes(deviceId)) {
        if (kd.devices.length >= kd.maxDevices) return res.json({ status: 'error', message: 'Hết lượt thiết bị!' });
        kd.devices.push(deviceId); saveDB(db);
    }
    res.json({ status: 'success', key: key, exp: kd.exp, devices: `${kd.devices.length}/${kd.maxDevices}` });
});

app.post('/api/ai', async (req, res) => {
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: req.body.prompt }] }] })
        });
        const d = await r.json();
        res.json({ status: 'success', text: d?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ AI lỗi phản hồi" });
    } catch (e) { res.status(500).json({ status: 'error' }); }
});

// ADMIN ACTIONS
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

// GIAO DIỆN ADMIN CHÍNH (FULL TÍNH NĂNG GỐC)
app.get('/', (req, res) => {
    let db = loadDB(); let keysHtml = '';
    for (let k in db) {
        let kd = db[k]; let isVip = k.startsWith('VIP-');
        let expT = kd.exp === 'pending' ? '<span style="color:#007bff;">Chờ kích hoạt</span>' : (kd.exp === 'permanent' ? 'Vĩnh viễn' : new Date(kd.exp).toLocaleString());
        keysHtml += `<tr style="${isVip ? 'background:#fffbf0;' : ''}">
            <td><strong style="color:${isVip ? '#f39c12' : '#333'}">${k}</strong></td>
            <td>${expT}</td>
            <td>${kd.devices.length}/${kd.maxDevices} <br><a href="/admin/reset-device/${k}" style="font-size:11px">[RESET HWID]</a></td>
            <td><a href="/admin/reset-time/${k}">[Reset TG]</a> | <a href="/admin/delete/${k}" onclick="return confirm('Xóa?')">[Xóa]</a></td></tr>`;
    }
    res.send(`<!DOCTYPE html><html><head><title>LVT ECOSYSTEM</title><style>
        body{font-family:Arial;padding:20px;background:#f4f4f9;} .card{background:#fff;padding:20px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.1);margin-bottom:20px;}
        table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:10px;text-align:left;} input,select,textarea{padding:8px;margin:5px;border-radius:4px;border:1px solid #ccc;}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;} .btn{background:#007bff;color:#fff;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;}
    </style></head><body>
        <div style="display:flex;justify-content:space-between;align-items:center;"><h1>LVT ADMIN ECOSYSTEM</h1><a href="/logout" style="color:red">Đăng xuất</a></div>
        <div class="grid">
            <div class="card"><h2>1. Tạo Key</h2>
                <form action="/admin/create" method="POST">
                    <select name="keyPrefix"><option value="LVT">Thường (LVT-)</option><option value="VIP">VIP (VIP-)</option></select>
                    <input type="number" name="duration" placeholder="Số thời gian" required>
                    <select name="type"><option value="day">Ngày</option><option value="hour">Giờ</option><option value="permanent">Vĩnh viễn</option></select>
                    Thiết bị: <input type="number" name="maxDevices" value="1" style="width:50px;">
                    <button type="submit" class="btn">TẠO KEY</button>
                </form>
            </div>
            <div class="card"><h2>2. Bọc Script Bảo Mật (Builder)</h2>
                <textarea id="b-code" placeholder="Dán code gốc vào đây..." style="width:100%;height:60px;"></textarea>
                <button onclick="build()" class="btn" style="margin-top:5px; background:#28a745">BỌC NGAY</button>
                <textarea id="b-final" readonly style="width:100%;height:40px;background:#eee;margin-top:5px;"></textarea>
            </div>
        </div>
        <div class="card"><h2>3. Danh sách Quản lý Key</h2>
            <form action="/admin/delete-bulk" method="POST" onsubmit="return confirm('Chắc chắn xóa?')">
                <select name="deleteType"><option value="expired">Xóa hết hạn</option><option value="all">Xóa tất cả</option></select>
                <button type="submit" style="background:#dc3545; color:#fff; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">Xóa hàng loạt</button>
            </form><br>
            <table><tr><th>Key</th><th>Hết hạn</th><th>Thiết bị</th><th>Hành động</th></tr>${keysHtml}</table>
        </div>
        <script>
            function build() {
                let c = document.getElementById('b-code').value; if(!c) return alert('Dán code!');
                let b64 = btoa(unescape(encodeURIComponent(c)));
                document.getElementById('b-final').value = "eval(decodeURIComponent(escape(atob('" + b64 + "'))));";
            }
        </script>
    </body></html>`);
});

app.listen(port, () => { console.log('Server is running on port ' + port); });
