require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TARGET_SERVER = process.env.TARGET_SERVER_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_KEY = process.env.MONITOR_API_KEY;

// Hàm gửi thông báo khẩn cấp về Telegram
async function sendTelegramAlert(message) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: CHAT_ID,
            text: `🚨 [SECURITY ALERT] 🚨\n${message}`,
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error("Không thể gửi thông báo Telegram:", error.message);
    }
}

// ==========================================
// 🛡️ CHỨC NĂNG 1: LÁ CHẮN TỰ BẢO VỆ (SELF-DEFENSE)
// ==========================================

// Middleware xác thực: Chỉ server chính hoặc bạn mới có quyền gọi vào server này
const authenticateRequest = (req, res, next) => {
    const apiKey = req.headers['x-monitor-key'];
    if (!apiKey || apiKey !== API_KEY) {
        // Gửi cảnh báo nếu có kẻ dò tìm đường dẫn server giám sát
        sendTelegramAlert(`Phát hiện truy cập trái phép vào Server Giám Sát!\nIP: ${req.ip}\nUser-Agent: ${req.headers['user-agent']}`);
        return res.status(403).json({ error: 'Truy cập bị từ chối. Lá chắn đã kích hoạt.' });
    }
    next();
};

// Chống crash: Nếu code gặp lỗi không mong muốn, server không bị sập mạng
process.on('uncaughtException', (err) => {
    console.error('Lỗi hệ thống nghiêm trọng (Uncaught Exception):', err);
    sendTelegramAlert(`Server Giám Sát gặp lỗi nội bộ nghiêm trọng: ${err.message}. Đã kích hoạt cơ chế tự phục hồi.`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Lỗi Promise chưa xử lý:', reason);
});


// ==========================================
// 🔍 CHỨC NĂNG 2: GIÁM SÁT & BẢO VỆ SERVER CHÍNH
// ==========================================

// Kiểm tra trạng thái server chính định kỳ mỗi 2 phút
cron.schedule('*/2 * * * *', async () => {
    console.log('🔄 Đang kiểm tra trạng thái server chính...');
    try {
        const startTime = Date.now();
        const response = await axios.get(`${TARGET_SERVER}/health-check`, { timeout: 10000 });
        const responseTime = Date.now() - startTime;

        // Nếu phản hồi quá chậm (> 5 giây), cảnh báo có thể đang bị DDoS
        if (responseTime > 5000) {
            sendTelegramAlert(`⚠️ Server chính phản hồi rất chậm (${responseTime}ms). Nghi vấn đang bị tấn công overload/DDoS!`);
        }
    } catch (error) {
        // Server chính không phản hồi (Chết/Sập)
        sendTelegramAlert(`💀 NGHIÊM TRỌNG: Server chính (${TARGET_SERVER}) KHÔNG PHẢN HỒI!\nMã lỗi: ${error.message}\nHãy kiểm tra ngay lập tức!`);
    }
});

// Endpoint nhận báo động log độc hại từ server chính gửi sang
app.post('/api/report-incident', authenticateRequest, (req, res) => {
    const { type, ip, details } = req.body;
    
    let message = `Phát hiện hành vi tấn công trên Server Chính!\n`;
    message += `🔹 Loại tấn công: ${type}\n`;
    message += `🔹 IP Kẻ tấn công: ${ip}\n`;
    message += `🔹 Chi tiết: ${JSON.stringify(details)}`;

    sendTelegramAlert(message);
    
    // TẠI ĐÂY: Bạn có thể viết thêm code để gọi API Cloudflare tự động block IP này.
    res.json({ status: 'success', message: 'Đã ghi nhận sự cố và kích hoạt báo động.' });
});


// ==========================================
// ⚡ CHỨC NĂNG 3: ANTI-SẬP / ANTI-NGỦ ĐÔNG TRÊN RENDER
// ==========================================

// 1. Tạo một route Ping công khai để Render hoặc các dịch vụ khác ping vào
app.get('/ping', (req, res) => {
    res.status(200).send('Server Giám Sát đang hoạt động ổn định 🟢');
});

// 2. Cơ chế Tự Gọi Chính Mình (Self-Ping): Cứ 10 phút tự gọi vào bản thân để Render không cho server "ngủ" (áp dụng cho gói Free của Render)
cron.schedule('*/10 * * * *', async () => {
    try {
        const selfUrl = `http://localhost:${PORT}/ping`;
        await axios.get(selfUrl);
        console.log('💚 Đã tự ping bản thân để chống ngủ đông trên Render.');
    } catch (error) {
        console.error('Lỗi tự ping:', error.message);
    }
});


// Khởi chạy Server
app.listen(PORT, () => {
    console.log(`🚀 Security Monitor Server đang chạy tại port ${PORT}`);
    sendTelegramAlert(`🟢 Server Giám Sát Bảo Mật đã khởi động thành công trên Render! Lá chắn bảo vệ đã sẵn sàng.`);
});
