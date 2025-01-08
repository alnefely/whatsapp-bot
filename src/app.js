const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const { SESSIONS_DIR } = require('./config/constants');
const db = require('./config/database');
const SystemMonitor = require('./services/systemMonitor');
const WhatsAppManager = require('./services/whatsappService');

// إنشاء المجلدات الضرورية
fs.ensureDirSync(SESSIONS_DIR);

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// إعداد محرك العرض EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// إضافة المجلدات الثابتة
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));
app.use(express.static(path.join(__dirname, 'public')));

// متغيرات لمراقبة النظام
let lastSystemInfo = null;
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 2000;

// دالة لجلب معلومات النظام
async function getSystemData() {
    const currentTime = Date.now();
    
    if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
        lastSystemInfo = {
            system: SystemMonitor.getSystemInfo(),
            whatsapp: await SystemMonitor.getWhatsAppStatus(WhatsAppManager),
            timestamp: new Date().toISOString()
        };
        lastUpdateTime = currentTime;
    }
    
    return lastSystemInfo;
}

// إعداد Socket.IO
io.on('connection', async (socket) => {
    console.log('Client connected to dashboard');

    // إرسال البيانات الأولية
    const initialData = await getSystemData();
    socket.emit('systemUpdate', initialData);

    // إعداد مراقب التحديثات
    const updateInterval = setInterval(async () => {
        const data = await getSystemData();
        socket.emit('systemUpdate', data);
    }, UPDATE_INTERVAL);

    // تنظيف عند قطع الاتصال
    socket.on('disconnect', () => {
        console.log('Client disconnected from dashboard');
        clearInterval(updateInterval);
    });
});

// Middleware
app.use(express.json());

// جعل Socket.IO متاحاً للراوترز
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/session', require('./routes/sessionRoutes'));
app.use('/message', require('./routes/messageRoutes'));
app.use('/auto-reply', require('./routes/autoReplyRoutes'));
app.use('/groups', require('./routes/groupRoutes'));


app.use('/whatsapp', require('./routes/whatsappRoutes'));


// تصدير server بدلاً من app
module.exports = server;