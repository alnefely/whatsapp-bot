const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const { SESSIONS_DIR, MAX_RETRIES, RETRY_INTERVAL, CONNECTION_TIMEOUT } = require('../config/constants');
const AutoReplyService = require('./autoReplyService');

// Global state
const sessions = new Map();
const qrCodes = new Map();
const connectionStates = new Map();
const pendingResponses = new Map();

// Logger configuration
const logger = pino({ level: 'silent' });

async function createConnection(sessionId, res = null) {
    try {
        if (res) {
            pendingResponses.set(sessionId, res);
        }

        if (sessions.has(sessionId)) {
            const existingSocket = sessions.get(sessionId);
            const isConnected = await checkConnectionState(existingSocket);
            
            if (isConnected) {
                handlePendingResponse(sessionId, true, 'Session connected', {
                    sessionId,
                    status: 'connected',
                    user: existingSocket.user
                });
                return { success: true, socket: existingSocket };
            }
            await cleanupSession(sessionId);
        }

        const { state, saveCreds } = await useMultiFileAuthState(
            path.join(SESSIONS_DIR, sessionId)
        );

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger,
            browser: ['Chrome (Linux)', '', ''],
            connectTimeoutMs: CONNECTION_TIMEOUT,
            qrTimeout: 40000,
            defaultQueryTimeoutMs: 60000,
            emitOwnEvents: true,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 5000
        });

        connectionStates.set(sessionId, {
            qrSent: false,
            connected: false,
            attempts: 0
        });

        // تحسين معالجة الرسائل
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                if (!message.key.fromMe) {
                    try {
                        const messageText = message.message?.conversation || 
                                          message.message?.extendedTextMessage?.text || '';
                        
                        if (messageText) {
                            console.log(`[${sessionId}] Received message:`, messageText);
                            
                            const reply = await AutoReplyService.findMatchingReply(
                                sessionId, 
                                messageText
                            );

                            if (reply) {
                                console.log(`[${sessionId}] Sending auto-reply:`, reply.response);
                                await sock.sendMessage(message.key.remoteJid, {
                                    text: reply.response
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`[${sessionId}] Auto-reply error:`, error);
                    }
                }
            }
        });

        // معالجة تحديثات الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const state = connectionStates.get(sessionId);

            if (!state) return;

            console.log(`[${sessionId}] Connection update:`, update);

            if (qr && !state.connected && !state.qrSent) {
                await handleQRCode(sessionId, qr, state);
            }

            if (connection === 'open') {
                await handleSuccessfulConnection(sessionId, sock);
            }

            if (connection === 'close') {
                await handleDisconnection(sessionId, lastDisconnect);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // تنظيف الـ pending response
        setTimeout(() => {
            handleConnectionTimeout(sessionId);
        }, CONNECTION_TIMEOUT);

        return { success: true, socket: sock };
    } catch (error) {
        console.error(`[${sessionId}] Connection error:`, error);
        handleError(sessionId, error);
        throw error;
    }
}

// Helper functions
async function handleQRCode(sessionId, qr, state) {
    try {
        const qrBase64 = await qrcode.toDataURL(qr);
        qrCodes.set(sessionId, qrBase64);
        
        state.qrSent = true;
        connectionStates.set(sessionId, state);
        
        handlePendingResponse(sessionId, true, 'QR Code generated', {
            sessionId,
            status: 'waiting_for_scan',
            qrCode: qrBase64
        });
    } catch (error) {
        console.error(`[${sessionId}] QR generation error:`, error);
    }
}

async function handleSuccessfulConnection(sessionId, sock) {
    const state = connectionStates.get(sessionId);
    state.connected = true;
    connectionStates.set(sessionId, state);
    sessions.set(sessionId, sock);
    qrCodes.delete(sessionId);

    handlePendingResponse(sessionId, true, 'Session connected successfully', {
        sessionId,
        status: 'connected',
        user: sock.user
    });
}

async function handleDisconnection(sessionId, lastDisconnect) {
    const state = connectionStates.get(sessionId);
    const statusCode = (lastDisconnect?.error instanceof Boom) ? 
        lastDisconnect.error.output.statusCode : 0;

    if (statusCode === DisconnectReason.loggedOut || state.attempts >= MAX_RETRIES) {
        await cleanupSession(sessionId);
        handlePendingResponse(sessionId, false, 'Connection failed permanently', {
            sessionId,
            status: 'disconnected',
            error: 'Max retries reached or logged out'
        }, 500);
    } else {
        state.attempts += 1;
        connectionStates.set(sessionId, state);
        setTimeout(() => createConnection(sessionId), RETRY_INTERVAL);
    }
}

function handlePendingResponse(sessionId, success, message, data, statusCode = 200) {
    const response = pendingResponses.get(sessionId);
    if (response && !response.headersSent) {
        response.status(statusCode).json({ success, message, data });
        pendingResponses.delete(sessionId);
    }
}

function handleConnectionTimeout(sessionId) {
    handlePendingResponse(sessionId, false, 'Connection timeout', {
        sessionId,
        status: 'timeout'
    }, 408);
}

function handleError(sessionId, error) {
    handlePendingResponse(sessionId, false, 'Connection failed', {
        error: error.message
    }, 500);
}

async function cleanupSession(sessionId) {
    try {
        const sock = sessions.get(sessionId);
        if (sock?.ws) {
            sock.ws.close();
        }
        sessions.delete(sessionId);
        qrCodes.delete(sessionId);
        connectionStates.delete(sessionId);
        pendingResponses.delete(sessionId);
        
        const sessionPath = path.join(SESSIONS_DIR, sessionId);
        await fs.remove(sessionPath).catch(() => {});
    } catch (error) {
        console.error(`[${sessionId}] Cleanup error:`, error);
    }
}

async function checkConnectionState(sock) {
    try {
        return !!await sock.user;
    } catch {
        return false;
    }
}

async function sendMessage(sock, to, message) {
    try {
        const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
        return await sock.sendMessage(jid, { text: message });
    } catch (error) {
        console.error('Send message error:', error);
        throw error;
    }
}

async function getAllSessions() {
    try {
        const sessionsInfo = [];
        
        // جمع معلومات كل الجلسات
        for (const [sessionId, socket] of sessions.entries()) {
            const state = connectionStates.get(sessionId) || {
                connected: false,
                qrSent: false,
                attempts: 0
            };

            let status = 'disconnected';
            let user = null;
            let lastSeen = null;
            let qrCode = null;

            // التحقق من حالة الاتصال
            try {
                if (socket && await checkConnectionState(socket)) {
                    status = 'connected';
                    user = socket.user;
                    lastSeen = new Date().toISOString();
                } else if (state.qrSent) {
                    status = 'waiting_for_scan';
                    qrCode = qrCodes.get(sessionId);
                } else {
                    status = 'disconnected';
                }
            } catch (error) {
                console.error(`Error checking session ${sessionId}:`, error);
                status = 'error';
            }

            // التحقق من وجود ملف الجلسة
            const sessionPath = path.join(SESSIONS_DIR, sessionId);
            const sessionExists = await fs.pathExists(sessionPath);

            sessionsInfo.push({
                sessionId,
                status,
                user: user ? {
                    id: user.id,
                    name: user.name,
                    phoneNumber: user.id.split(':')[0]
                } : null,
                lastSeen,
                qrCode,
                sessionExists,
                connectionInfo: {
                    attempts: state.attempts,
                    maxRetries: MAX_RETRIES,
                    connected: state.connected
                }
            });
        }

        // التحقق من الجلسات المخزنة في الملفات ولكن غير نشطة
        const storedSessions = await fs.readdir(SESSIONS_DIR).catch(() => []);
        for (const sessionFolder of storedSessions) {
            if (!sessions.has(sessionFolder)) {
                sessionsInfo.push({
                    sessionId: sessionFolder,
                    status: 'stored',
                    user: null,
                    lastSeen: null,
                    qrCode: null,
                    sessionExists: true,
                    connectionInfo: {
                        attempts: 0,
                        maxRetries: MAX_RETRIES,
                        connected: false
                    }
                });
            }
        }

        return {
            success: true,
            total: sessionsInfo.length,
            active: sessionsInfo.filter(s => s.status === 'connected').length,
            waiting: sessionsInfo.filter(s => s.status === 'waiting_for_scan').length,
            stored: sessionsInfo.filter(s => s.status === 'stored').length,
            sessions: sessionsInfo
        };
    } catch (error) {
        console.error('Error getting sessions:', error);
        throw error;
    }
}

async function deleteDevice(sessionId) {
    try {
        const sessionPath = path.join(SESSIONS_DIR, sessionId);
        const socket = this.sessions.get(sessionId);

        // محاولة تسجيل الخروج إذا كانت الجلسة متصلة
        if (socket) {
            try {
                await socket.logout();
            } catch (logoutError) {
                console.warn(`Logout warning for ${sessionId}:`, logoutError);
            }
        }

        // تنظيف الجلسة من الذاكرة
        await this.cleanupSession(sessionId);

        // حذف مجلد الجلسة
        if (await fs.pathExists(sessionPath)) {
            await fs.remove(sessionPath);
        }

        // حذف البيانات من المتغيرات العامة
        this.sessions.delete(sessionId);
        this.qrCodes.delete(sessionId);
        this.connectionStates.delete(sessionId);

        return {
            success: true,
            message: 'Device deleted successfully',
            sessionId
        };
    } catch (error) {
        console.error('Delete device error:', error);
        throw error;
    }
}

/**
 * التحقق من وجود الجهاز
 */
async function deviceExists(sessionId) {
    const sessionPath = path.join(SESSIONS_DIR, sessionId);
    return await fs.pathExists(sessionPath);
}


/**
     * تغيير اسم الجلسة
     */
async function renameSession(oldSessionId, newSessionId) {
    try {
        // التحقق من وجود الجلسة القديمة
        const oldSessionPath = path.join(SESSIONS_DIR, oldSessionId);
        if (!await fs.pathExists(oldSessionPath)) {
            throw new Error('Original session not found');
        }

        // التحقق من عدم وجود جلسة بالاسم الجديد
        const newSessionPath = path.join(SESSIONS_DIR, newSessionId);
        if (await fs.pathExists(newSessionPath)) {
            throw new Error('New session name already exists');
        }

        // الحصول على الحالة الحالية للجلسة
        const socket = this.sessions.get(oldSessionId);
        const isConnected = socket ? await this.checkConnectionState(socket) : false;
        const connectionState = this.connectionStates.get(oldSessionId);

        try {
            // إغلاق الاتصال الحالي إذا كان موجوداً
            if (socket) {
                await socket.ev.removeAllListeners();
                socket.end();
            }

            // نقل ملفات الجلسة
            await fs.move(oldSessionPath, newSessionPath);

            // حذف المراجع القديمة
            this.sessions.delete(oldSessionId);
            this.qrCodes.delete(oldSessionId);
            this.connectionStates.delete(oldSessionId);

            await AutoReplyService.UpdateDeviceId(oldSessionId, newSessionId)

            // إعادة إنشاء الاتصال بالاسم الجديد
            if (isConnected) {
                await this.createConnection(newSessionId);
                
                // انتظار التأكد من الاتصال
                const newSocket = this.sessions.get(newSessionId);
                let retries = 0;
                const maxRetries = 5;
                
                while (retries < maxRetries) {
                    const newConnection = await this.checkConnectionState(newSocket);
                    if (newConnection) break;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries++;
                }
            }

            return {
                success: true,
                message: 'Session renamed successfully',
                data: {
                    oldSessionId,
                    newSessionId,
                    wasConnected: isConnected,
                    isConnected: this.sessions.has(newSessionId) && 
                               await this.checkConnectionState(this.sessions.get(newSessionId))
                }
            };

        } catch (error) {
            // في حالة حدوث خطأ، محاولة استعادة الحالة السابقة
            if (await fs.pathExists(newSessionPath)) {
                await fs.move(newSessionPath, oldSessionPath).catch(console.error);
            }
            if (isConnected) {
                await this.createConnection(oldSessionId).catch(console.error);
            }
            throw error;
        }

    } catch (error) {
        console.error('Rename session error:', error);
        throw error;
    }
}

/**
 * التحقق من صحة اسم الجلسة
 */
async function validateSessionName(sessionId) {
    // التحقق من أن الاسم يحتوي فقط على أحرف وأرقام وشرطة سفلية
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validNameRegex.test(sessionId)) {
        throw new Error('Session name can only contain letters, numbers, underscores, and hyphens');
    }

    // التحقق من طول الاسم
    if (sessionId.length < 3 || sessionId.length > 50) {
        throw new Error('Session name must be between 3 and 50 characters');
    }

    return true;
}

module.exports = {
    sessions,
    qrCodes,
    connectionStates,
    createConnection,
    cleanupSession,
    sendMessage,
    checkConnectionState,
    getAllSessions,
    deleteDevice,
    deviceExists,
    renameSession,
    validateSessionName
};