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

// ==============================================
// SERVER KEY DÙNG CHUNG CHO BƯỚC 1
// ==============================================
const MASTER_SERVER_KEY = 'LVT-SERVER-PRO'; 

function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ==============================================
// MIDDLEWARE BẢO MẬT TRANG ADMIN
// ==============================================
app.use((req, res, next) => {
    if (req.path === '/api/check' || req.path === '/api/ai') return next();
    if (req.path === '/login') return next();
    const cookies = req.headers.cookie || '';
    if (cookies.includes('admin_auth=true')) {
        return next();
    }
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
            .login-card input:focus { border-color: #0ff; box-shadow: 0 0 15px rgba(0,255,255,0.4); background: rgba(0,0,0,0.6); }
            .login-card input::placeholder { color: #aaa; }
            .login-card button { width: 100%; padding: 15px; background: linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%); color: #fff; font-weight: bold; border: none; border-radius: 30px; cursor: pointer; font-size: 16px; transition: 0.3s; box-shadow: 0 5px 15px rgba(0, 210, 255, 0.4); text-transform: uppercase; }
            .login-card button:hover { transform: scale(1.05); filter: brightness(1.2); }
        </style>
    </head>
    <body>
        <div class="overlay"></div>
        <div class="login-card">
            <h2>LVT ADMIN PRO</h2>
            <form action="/login" method="POST">
                <input type="password" name="password" placeholder="Nhập mật khẩu quản trị..." required autocomplete="off">
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
// 1. API CHECK KEY (TÍNH THỜI GIAN KHI LOGIN)
// ==============================================
app.post('/api/check', (req, res) => {
    const { key, deviceId } = req.body;

    if (key === MASTER_SERVER_KEY) {
        return res.json({ status: 'success', message: 'Xác thực Server Key thành công!', key: key, exp: 'permanent', devices: '∞/∞' });
    }

    let db = loadDB();

    if (!db[key]) return res.json({ status: 'error', message: 'Key không tồn tại!' });
    let keyData = db[key];
    if (keyData.status === 'banned') return res.json({ status: 'error', message: 'Key này đã bị khóa (Banned)!' });

    // CHỈ BẮT ĐẦU ĐẾM THỜI GIAN KHI LẦN ĐẦU TIÊN ĐĂNG NHẬP
    if (keyData.exp === 'pending') {
        keyData.exp = Date.now() + keyData.durationMs;
        saveDB(db);
    }

    if (keyData.exp !== 'permanent' && Date.now() > keyData.exp) return res.json({ status: 'error', message: 'Key đã hết hạn!' });

    if (!keyData.devices.includes(deviceId)) {
        if (keyData.devices.length >= keyData.maxDevices) return res.json({ status: 'error', message: 'Key đã đạt giới hạn số thiết bị!' });
        keyData.devices.push(deviceId);
        saveDB(db);
    }

    res.json({ status: 'success', message: 'Xác thực thành công!', key: key, exp: keyData.exp, devices: `${keyData.devices.length}/${keyData.maxDevices}` });
});

// ==============================================
// 2. API TRỢ LÝ AI
// ==============================================
app.post('/api/ai', async (req, res) => {
    try {
        const { prompt } = req.body;
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Lỗi không phản hồi từ AI";
        res.json({ status: 'success', text: text });
    } catch (error) {
        console.error("Lỗi gọi API:", error);
        res.status(500).json({ status: 'error', message: "Lỗi kết nối máy chủ AI" });
    }
});

// ==============================================
// 3. API QUẢN TRỊ (THÊM RESET & XÓA HÀNG LOẠT)
// ==============================================
app.post('/admin/create', (req, res) => {
    let { duration, type, maxDevices, quantity, keyPrefix } = req.body; 
    let db = loadDB();
    let qty = parseInt(quantity) || 1;
    let prefix = keyPrefix === 'VIP' ? 'VIP-' : 'LVT-'; 

    for (let i = 0; i < qty; i++) {
        const newKey = `${prefix}${Math.random().toString(36).substring(2, 8).toUpperCase()}`; 
        let expTime = 'permanent';
        let durationMs = 0;

        if (type !== 'permanent') { 
            const multipliers = { 'sec': 1000, 'min': 60000, 'hour': 3600000, 'day': 86400000, 'month': 2592000000, 'year': 31536000000 }; 
            durationMs = parseInt(duration) * multipliers[type]; 
            expTime = 'pending'; // Trạng thái chờ, chưa đếm giờ
        }
        db[newKey] = { exp: expTime, durationMs: durationMs, maxDevices: parseInt(maxDevices), devices: [], status: 'active' }; 
    }
    
    saveDB(db); 
    res.redirect('/');
});

app.post('/admin/add-time/:key', (req, res) => {
    let key = req.params.key; let { duration, type } = req.body; let db = loadDB();
    if (db[key] && db[key].exp !== 'permanent') { 
        const multipliers = { 'sec': 1000, 'min': 60000, 'hour': 3600000, 'day': 86400000, 'month': 2592000000, 'year': 31536000000 }; 
        let timeToAdd = parseInt(duration) * multipliers[type]; 
        if (db[key].exp === 'pending') { db[key].durationMs += timeToAdd; } 
        else { if (Date.now() > db[key].exp) db[key].exp = Date.now() + timeToAdd; else db[key].exp += timeToAdd; }
        saveDB(db); 
    } 
    res.redirect('/');
});

// TÍNH NĂNG MỚI: Reset Thiết bị đã lưu của Key
app.get('/admin/reset-device/:key', (req, res) => { 
    let db = loadDB(); 
    if (db[req.params.key]) { db[req.params.key].devices = []; saveDB(db); } 
    res.redirect('/'); 
});

// TÍNH NĂNG MỚI: Đưa Key trở lại trạng thái chờ kích hoạt (Khởi động lại thời gian)
app.get('/admin/reset-time/:key', (req, res) => { 
    let db = loadDB(); 
    if (db[req.params.key] && db[req.params.key].exp !== 'permanent') { db[req.params.key].exp = 'pending'; saveDB(db); } 
    res.redirect('/'); 
});

// TÍNH NĂNG MỚI: Xóa hàng loạt tùy chọn
app.post('/admin/delete-bulk', (req, res) => {
    let { deleteType } = req.body; 
    let db = loadDB();
    let now = Date.now();
    for (let k in db) {
        if (deleteType === 'all') {
            delete db[k];
        } else if (deleteType === 'expired' && db[k].exp !== 'permanent' && db[k].exp !== 'pending' && now > db[k].exp) {
            delete db[k];
        } else if (deleteType === 'banned' && db[k].status === 'banned') {
            delete db[k];
        }
    }
    saveDB(db);
    res.redirect('/');
});

app.get('/admin/add-device/:key', (req, res) => { let db = loadDB(); if (db[req.params.key]) { db[req.params.key].maxDevices += 1; saveDB(db); } res.redirect('/'); });
app.get('/admin/sub-device/:key', (req, res) => { let db = loadDB(); if (db[req.params.key] && db[req.params.key].maxDevices > 1) { db[req.params.key].maxDevices -= 1; saveDB(db); } res.redirect('/'); });
app.get('/admin/ban/:key', (req, res) => { let db = loadDB(); if (db[req.params.key]) { db[req.params.key].status = 'banned'; saveDB(db); } res.redirect('/'); });
app.get('/admin/unban/:key', (req, res) => { let db = loadDB(); if (db[req.params.key]) { db[req.params.key].status = 'active'; saveDB(db); } res.redirect('/'); });
app.get('/admin/delete/:key', (req, res) => { let db = loadDB(); if (db[req.params.key]) { delete db[req.params.key]; saveDB(db); } res.redirect('/'); });

// ==============================================
// 4. GIAO DIỆN ADMIN VÀ BUILDER
// ==============================================
app.get('/', (req, res) => {
    let db = loadDB(); let keysHtml = '';
    for (let k in db) {
        let keyData = db[k]; if (!keyData.status) keyData.status = 'active'; 
        let isBanned = keyData.status === 'banned'; let statusText = isBanned ? '<span style="color:red;font-weight:bold;">BANNED</span>' : '<span style="color:green;font-weight:bold;">ACTIVE</span>';
        
        let expText = 'Vĩnh viễn'; 
        if (keyData.exp === 'pending') { expText = `<span style="color:#007bff;font-weight:bold;">Chờ kích hoạt</span>`; } 
        else if (keyData.exp !== 'permanent') { expText = new Date(keyData.exp).toLocaleString(); if (Date.now() > keyData.exp) expText = `<span style="color:gray;">Hết hạn (${expText})</span>`; }

        let isVipKey = k.startsWith('VIP-');
        let keyDisplayHtml = isVipKey 
            ? `<strong style="font-size: 16px; color: #f39c12; text-shadow: 0 0 2px rgba(243,156,18,0.5);">★ ${k}</strong>` 
            : `<strong style="font-size: 16px;">${k}</strong>`;

        let deviceHtml = `
            <div style="display:flex; align-items:center; gap:8px;">
                <a href="/admin/sub-device/${k}" style="text-decoration:none;"><button style="padding:2px 8px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">-</button></a>
                <strong style="font-size:15px; min-width: 30px; text-align:center;">${keyData.devices.length}/${keyData.maxDevices}</strong>
                <a href="/admin/add-device/${k}" style="text-decoration:none;"><button style="padding:2px 8px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">+</button></a>
                <a href="/admin/reset-device/${k}" title="Xóa thiết bị đã lưu để dùng cho máy khác" style="text-decoration:none;"><button style="padding:2px 8px; background:#ffc107; color:#000; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">🔄 Reset</button></a>
            </div>
        `;

        let actionButtons = `
            <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
                ${keyData.exp !== 'permanent' ? `<form action="/admin/add-time/${k}" method="POST" style="margin:0; display:flex; gap:2px;"><input type="number" name="duration" placeholder="Số" style="width:50px; padding:5px; margin:0;" required><select name="type" style="padding:5px; margin:0;"><option value="min">Phút</option><option value="hour">Giờ</option><option value="day">Ngày</option></select><button type="submit" class="btn-add">+ T.Gian</button></form>` : '<span>(Key V.Viễn)</span>'}
                ${keyData.exp !== 'permanent' && keyData.exp !== 'pending' ? `<a href="/admin/reset-time/${k}" title="Khôi phục trạng thái chờ kích hoạt"><button style="background:#6c757d; padding:5px; border:none; color:white; border-radius:4px; cursor:pointer; font-weight:bold;">⏳ Reset TG</button></a>` : ''}
                <a href="/admin/${isBanned ? 'unban' : 'ban'}/${k}"><button class="${isBanned ? 'btn-unban' : 'btn-ban'}">${isBanned ? 'Mở Khóa' : 'Khóa Key'}</button></a>
                <a href="/admin/delete/${k}" onclick="return confirm('Xóa vĩnh viễn key này?')"><button class="btn-delete">Xóa</button></a>
            </div>`;
        keysHtml += `<tr style="${isBanned ? 'background:#ffe6e6;' : (isVipKey ? 'background:#fffbf0;' : '')}"><td onclick="copyKey('${k}')" style="cursor:pointer; transition: 0.2s;" title="Nhấn để copy key">${keyDisplayHtml} <br><span id="copy-msg-${k}" style="font-size: 11px; color: #6c757d; font-style: italic;">(Nhấn để copy)</span><br>${statusText}</td><td>${expText}</td><td>${deviceHtml}</td><td>${actionButtons}</td></tr>`;
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>LVT Loader Ecosystem Pro</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial; padding: 10px; background: #f4f4f9; font-size: 14px; }
            .grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
            @media (min-width: 800px) { .grid { grid-template-columns: 1fr 1fr; } }
            .card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow-x: auto;}
            input, select, textarea { padding: 8px; margin: 5px 0; border: 1px solid #ccc; border-radius: 4px; width: 100%; box-sizing: border-box; font-family: monospace;}
            button { border: none; cursor: pointer; border-radius: 4px; font-weight: bold; padding: 8px; color: white;}
            .btn-main { background: #007bff; width: 100%; margin-top: 10px; font-size: 16px;}
            .btn-build { background: #28a745; width: 100%; margin-top: 10px; font-size: 16px;}
            .btn-add { background: #17a2b8; } .btn-ban { background: #ff9800; } .btn-unban { background: #28a745; } .btn-delete { background: #dc3545; }
            table { width: 100%; border-collapse: collapse; min-width: 600px; } th, td { padding: 10px; border: 1px solid #ddd; text-align: left; vertical-align: middle; } th { background: #f8f9fa; } td:hover { background: #f1f1f1; }
            .flex-row { display: flex; gap: 10px; }
            .header-bar { display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 10px 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        </style>
    </head>
    <body>
        <div class="header-bar">
            <h1 style="margin: 0; color: #333; font-size: 22px;">LVT LOADER ECOSYSTEM</h1>
            <a href="/logout" style="background: #dc3545; color: #fff; padding: 8px 15px; text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 14px; transition: 0.2s;" onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">Đăng Xuất</a>
        </div>
        
        <div class="grid">
            <div class="card form-create">
                <h2 style="margin-top:0; color: #007bff;">1. Tạo Key Mới</h2>
                <form action="/admin/create" method="POST">
                    <div class="flex-row">
                        <select name="keyPrefix" style="border: 2px solid #00ffcc; font-weight:bold; color: #333;">
                            <option value="LVT">Tạo Key Thường (LVT-)</option>
                            <option value="VIP">Tạo Key VIP (VIP-)</option>
                        </select>
                    </div>
                    <div class="flex-row">
                        <input type="number" name="duration" placeholder="Số thời gian (VD: 1, 30...)" required>
                        <select name="type">
                            <option value="sec">Giây</option><option value="min">Phút</option><option value="hour">Giờ</option>
                            <option value="day">Ngày</option><option value="month">Tháng</option><option value="year">Năm</option>
                            <option value="permanent">Vĩnh viễn</option>
                        </select>
                    </div>
                    <div class="flex-row">
                        <input type="number" name="maxDevices" placeholder="Số thiết bị tối đa" value="1" required>
                        <input type="number" name="quantity" placeholder="Số lượng tạo (VD: 2)" value="1" required style="border-color: #ff9800; font-weight:bold;">
                    </div>
                    <button type="submit" class="btn-main">Tạo Key Ngay</button>
                </form>
            </div>
            <div class="card">
                <h2 style="margin-top:0; color: #28a745;">2. Bọc Script (Hỗ Trợ Document Start)</h2>
                <input type="text" id="b-url" placeholder="Trang web áp dụng (VD: *://*.olm.vn/*)" value="*://*.olm.vn/*">
                <input type="text" id="b-server" placeholder="Link Server" value="http://localhost:3000">
                <textarea id="b-code" rows="4" placeholder="Dán code Hack/Tool gốc vào đây (không cần ==UserScript==)..."></textarea>
                <button class="btn-build" onclick="buildScript()">BỌC SCRIPT NGAY</button>
                <textarea id="b-final" rows="4" placeholder="Script đã được đóng gói an toàn sẽ hiện ở đây..." readonly style="margin-top: 10px; background: #e9ecef; border: 2px solid #28a745;"></textarea>
                <button class="btn-main" onclick="copyFinalCode()" style="background: #333;">Copy Script Bảo Mật</button>
            </div>
        </div>
        <div class="card" style="margin-top: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <h2 style="margin-top:0; margin-bottom:0;">3. Danh sách Quản Lý Key</h2>
                <form action="/admin/delete-bulk" method="POST" style="margin:0; display:flex; gap:10px;" onsubmit="return confirm('Bạn có chắc chắn muốn xóa hàng loạt? Hành động này KHÔNG THỂ hoàn tác!')">
                    <select name="deleteType" style="padding:5px; margin:0; width:auto; font-weight:bold;">
                        <option value="expired">Xóa Key Hết Hạn</option>
                        <option value="banned">Xóa Key Bị Khóa</option>
                        <option value="all">Xóa TẤT CẢ Key</option>
                    </select>
                    <button type="submit" style="background:#dc3545; padding:5px 15px;">Xóa Hàng Loạt</button>
                </form>
            </div>
            <br>
            <table><tr><th>Key / Trạng thái</th><th>Hết hạn</th><th>Thiết bị</th><th>Hành động</th></tr>${keysHtml}</table>
        </div>

        <script>
            function copyKey(k) {
                navigator.clipboard.writeText(k);
                let msg = document.getElementById('copy-msg-' + k);
                msg.innerText = '(Đã copy!)'; msg.style.color = 'green';
                setTimeout(() => { msg.innerText = '(Nhấn để copy)'; msg.style.color = '#6c757d'; }, 2000);
            }
            function buildScript() {
                let url = document.getElementById('b-url').value;
                let server = document.getElementById('b-server').value;
                let code = document.getElementById('b-code').value;
                if(!code) return alert('Vui lòng dán code!');
                
                let base64Code = btoa(unescape(encodeURIComponent(code))); 
                let template = document.getElementById('script-template').innerHTML;
                
                let finalCode = template
                    .replace(/\\{\\{URL\\}\\}/g, url)
                    .replace(/\\{\\{SERVER\\}\\}/g, server)
                    .replace(/\\{\\{BASE64_USER_CODE\\}\\}/g, base64Code);
                    
                document.getElementById('b-final').value = finalCode;
            }
            function copyFinalCode() {
                let final = document.getElementById('b-final');
                if(!final.value) return;
                final.select(); document.execCommand('copy'); alert('Đã copy script bảo mật!');
            }
        </script>

        <script type="text/template" id="script-template">
// ==UserScript==
// @name         LVT Protected Script Dual-Key
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Hệ thống Loader yêu cầu 2 lớp Key
// @match        {{URL}}
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-start
// @connect      localhost
// @connect      *
// ==/UserScript==

(function() {
    'use strict';
    const _0xRoot = document.documentElement;
    const style = document.createElement('style');
    style.innerHTML = '.swal2-container { z-index: 2147483647 !important; } body { margin: 0; } * { box-sizing: border-box; }';
    _0xRoot.appendChild(style);

    const _0xUrl = '{{SERVER}}/api/check'; 
    let _0xDev = GM_getValue('lvt_device_id');
    if (!_0xDev) { _0xDev = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase(); GM_setValue('lvt_device_id', _0xDev); }

    const _0xUI_Lock = \`
    <div id="lvt-lock" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,20,0.95);z-index:2147483646;display:flex;justify-content:center;align-items:center;">
        <div style="background:#111;padding:40px;border-radius:24px;text-align:center;width:380px;border:1px solid #0ff;">
            <h2 style="color:#0ff;">GALAXY SECURITY</h2>
            <p style="color:#aaa;">Tọa độ: \${_0xDev}</p>
            <input id="lvt-key-1" type="text" placeholder="Mật mã Không gian 1..." style="width:100%;padding:10px;margin-bottom:10px;">
            <input id="lvt-key-2" type="text" placeholder="Mật mã Không gian 2..." style="width:100%;padding:10px;margin-bottom:20px;">
            <button id="lvt-btn-submit" style="width:100%;padding:10px;background:#007bff;color:#fff;font-weight:bold;cursor:pointer;">KÍCH HOẠT</button>
        </div>
    </div>\`;

    function _0xRunMyHack() {
        console.log("LVT SYSTEM: Kích hoạt tool...");
        try { const _0xRaw = decodeURIComponent(escape(window.atob('{{BASE64_USER_CODE}}'))); eval(_0xRaw); } 
        catch(e) { console.error("Lỗi code:", e); }
    }

    const checkKeyAPI = (key) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", url: _0xUrl, headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ key: key, deviceId: _0xDev }),
            onload: function(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.status === 'success') resolve(data);
                    else reject(data.message);
                } catch(e) { reject('Lỗi máy chủ JSON!'); }
            },
            onerror: () => reject('Không thể kết nối Server API!')
        });
    });

    document.addEventListener('DOMContentLoaded', () => {
        document.body.insertAdjacentHTML('beforeend', _0xUI_Lock);
        document.getElementById('lvt-btn-submit').addEventListener('click', async () => {
            const k1 = document.getElementById('lvt-key-1').value.trim();
            const k2 = document.getElementById('lvt-key-2').value.trim();
            if (!k1 || !k2) {
                if(typeof Swal !== 'undefined') Swal.fire('Lỗi', 'Nhập đủ 2 Key!', 'error');
                else alert('Vui lòng nhập đủ 2 Key!');
                return;
            }
            
            const btn = document.getElementById('lvt-btn-submit');
            btn.innerText = 'ĐANG KIỂM TRA...';
            try {
                await checkKeyAPI(k1);
                await checkKeyAPI(k2);
                document.getElementById('lvt-lock').remove();
                _0xRunMyHack();
            } catch (err) {
                if(typeof Swal !== 'undefined') Swal.fire('Lỗi', err, 'error');
                else alert('Lỗi: ' + err);
                btn.innerText = 'KÍCH HOẠT';
            }
        });
    });
})();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// KHỞI ĐỘNG SERVER
app.listen(port, () => {
    console.log(`\n🚀 LVT Server đang chạy tại: http://localhost:${port}`);
    console.log(`🌐 Truy cập http://localhost:${port}/login để vào trang Quản Trị`);
});
