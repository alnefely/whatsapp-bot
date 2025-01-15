const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const { SESSIONS_DIR, MAX_RETRIES, RETRY_INTERVAL, CONNECTION_TIMEOUT } = require('../config/constants');
const AutoReplyService = require('./autoReplyService');

class WhatsAppManager {
    constructor() {
        this.sessions = new Map();
        this.qrCodes = new Map();
        this.connectionStates = new Map();
        this.pendingResponses = new Map();
        this.logger = pino({ level: 'silent' });
    }

    async createConnection(sessionId, res = null) {
        try {
            if (res) {
                this.pendingResponses.set(sessionId, res);
            }

            if (this.sessions.has(sessionId)) {
                const existingSocket = this.sessions.get(sessionId);
                const isConnected = await this.checkConnectionState(existingSocket);
                
                if (isConnected) {
                    this.handlePendingResponse(sessionId, true, 'Session connected', {
                        sessionId,
                        status: 'connected',
                        user: existingSocket.user
                    });
                    return { success: true, socket: existingSocket };
                }
                await this.cleanupSession(sessionId);
            }

            const { state, saveCreds } = await useMultiFileAuthState(
                path.join(SESSIONS_DIR, sessionId)
            );
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                syncFullHistory: true,
                logger: this.logger,
                browser: ['Chrome (Linux)', '', ''],
                connectTimeoutMs: CONNECTION_TIMEOUT,
                qrTimeout: 40000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                markOnlineOnConnect: true,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 5000
            });

            this.connectionStates.set(sessionId, {
                qrSent: false,
                connected: false,
                attempts: 0
            });

            this.setupSocketListeners(sock, sessionId, saveCreds);

            return { success: true, socket: sock };
        } catch (error) {
            console.error(`[${sessionId}] Connection error:`, error);
            this.handleError(sessionId, error);
            throw error;
        }
    }

    setupSocketListeners(sock, sessionId, saveCreds) {
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

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const state = this.connectionStates.get(sessionId);

            if (!state) return;

            console.log(`[${sessionId}] Connection update:`, update);

            if (qr && !state.connected && !state.qrSent) {
                await this.handleQRCode(sessionId, qr, state);
            }

            if (connection === 'open') {
                await this.handleSuccessfulConnection(sessionId, sock);
            }

            if (connection === 'close') {
                await this.handleDisconnection(sessionId, lastDisconnect);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        setTimeout(() => {
            this.handleConnectionTimeout(sessionId);
        }, CONNECTION_TIMEOUT);
    }

    async handleQRCode(sessionId, qr, state) {
        try {
            const qrBase64 = await qrcode.toDataURL(qr);
            this.qrCodes.set(sessionId, qrBase64);
            
            state.qrSent = true;
            this.connectionStates.set(sessionId, state);
            
            this.handlePendingResponse(sessionId, true, 'QR Code generated', {
                sessionId,
                status: 'waiting_for_scan',
                qrCode: qrBase64
            });
        } catch (error) {
            console.error(`[${sessionId}] QR generation error:`, error);
        }
    }

    async handleSuccessfulConnection(sessionId, sock) {
        const state = this.connectionStates.get(sessionId);
        state.connected = true;
        this.connectionStates.set(sessionId, state);
        this.sessions.set(sessionId, sock);
        this.qrCodes.delete(sessionId);

        this.handlePendingResponse(sessionId, true, 'Session connected successfully', {
            sessionId,
            status: 'connected',
            user: sock.user
        });
    }

    async handleDisconnection(sessionId, lastDisconnect) {
        const state = this.connectionStates.get(sessionId);
        const statusCode = (lastDisconnect?.error instanceof Boom) ? 
            lastDisconnect.error.output.statusCode : 0;

        if (statusCode === DisconnectReason.loggedOut || state.attempts >= MAX_RETRIES) {
            await this.cleanupSession(sessionId);
            this.handlePendingResponse(sessionId, false, 'Connection failed permanently', {
                sessionId,
                status: 'disconnected',
                error: 'Max retries reached or logged out'
            }, 500);
        } else {
            state.attempts += 1;
            this.connectionStates.set(sessionId, state);
            setTimeout(() => this.createConnection(sessionId), RETRY_INTERVAL);
        }
    }

    handlePendingResponse(sessionId, success, message, data, statusCode = 200) {
        const response = this.pendingResponses.get(sessionId);
        if (response && !response.headersSent) {
            response.status(statusCode).json({ success, message, data });
            this.pendingResponses.delete(sessionId);
        }
    }

    handleConnectionTimeout(sessionId) {
        this.handlePendingResponse(sessionId, false, 'Connection timeout', {
            sessionId,
            status: 'timeout'
        }, 408);
    }

    handleError(sessionId, error) {
        this.handlePendingResponse(sessionId, false, 'Connection failed', {
            error: error.message
        }, 500);
    }

    async cleanupSession(sessionId) {
        try {
            const sock = this.sessions.get(sessionId);
            if (sock?.ws) {
                sock.ws.close();
            }
            this.sessions.delete(sessionId);
            this.qrCodes.delete(sessionId);
            this.connectionStates.delete(sessionId);
            this.pendingResponses.delete(sessionId);
            
            const sessionPath = path.join(SESSIONS_DIR, sessionId);
            await fs.remove(sessionPath).catch(() => {});
        } catch (error) {
            console.error(`[${sessionId}] Cleanup error:`, error);
        }
    }

    async checkConnectionState(sock) {
        try {
            return !!await sock.user;
        } catch {
            return false;
        }
    }

    async sendMessage(sock, to, message) {
        try {
            const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
            return await sock.sendMessage(jid, { text: message });
        } catch (error) {
            console.error('Send message error:', error);
            throw error;
        }
    }

    async getAllSessions() {
        try {
            const sessionsInfo = [];
            
            for (const [sessionId, socket] of this.sessions.entries()) {
                const state = this.connectionStates.get(sessionId) || {
                    connected: false,
                    qrSent: false,
                    attempts: 0
                };

                let status = 'disconnected';
                let user = null;
                let lastSeen = null;
                let qrCode = null;

                try {
                    if (socket && await this.checkConnectionState(socket)) {
                        status = 'connected';
                        user = socket.user;
                        lastSeen = new Date().toISOString();
                    } else if (state.qrSent) {
                        status = 'waiting_for_scan';
                        qrCode = this.qrCodes.get(sessionId);
                    } else {
                        status = 'disconnected';
                    }
                } catch (error) {
                    console.error(`Error checking session ${sessionId}:`, error);
                    status = 'error';
                }

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

            const storedSessions = await fs.readdir(SESSIONS_DIR).catch(() => []);
            for (const sessionFolder of storedSessions) {
                if (!this.sessions.has(sessionFolder)) {
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

    async deleteDevice(sessionId) {
        try {
            const sessionPath = path.join(SESSIONS_DIR, sessionId);
            const socket = this.sessions.get(sessionId);

            if (socket) {
                try {
                    await socket.logout();
                } catch (logoutError) {
                    console.warn(`Logout warning for ${sessionId}:`, logoutError);
                }
            }

            await this.cleanupSession(sessionId);

            if (await fs.pathExists(sessionPath)) {
                await fs.remove(sessionPath);
            }

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

    async deviceExists(sessionId) {
        const sessionPath = path.join(SESSIONS_DIR, sessionId);
        return await fs.pathExists(sessionPath);
    }

    async renameSession(oldSessionId, newSessionId) {
        try {
            const oldSessionPath = path.join(SESSIONS_DIR, oldSessionId);
            if (!await fs.pathExists(oldSessionPath)) {
                throw new Error('Original session not found');
            }

            const newSessionPath = path.join(SESSIONS_DIR, newSessionId);
            if (await fs.pathExists(newSessionPath)) {
                throw new Error('New session name already exists');
            }

            const socket = this.sessions.get(oldSessionId);
            const isConnected = socket ? await this.checkConnectionState(socket) : false;

            try {
                if (socket) {
                    await socket.ev.removeAllListeners();
                    socket.end();
                }

                await fs.move(oldSessionPath, newSessionPath);

                this.sessions.delete(oldSessionId);
                this.qrCodes.delete(oldSessionId);
                this.connectionStates.delete(oldSessionId);

                await AutoReplyService.UpdateDeviceId(oldSessionId, newSessionId);

                if (isConnected) {
                    await this.createConnection(newSessionId);
                    
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

    async validateSessionName(sessionId) {
        const validNameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!validNameRegex.test(sessionId)) {
            throw new Error('Session name can only contain letters, numbers, underscores, and hyphens');
        }

        if (sessionId.length < 3 || sessionId.length > 50) {
            throw new Error('Session name must be between 3 and 50 characters');
        }

        return true;
    }


    /**
     * الحصول على جميع المجموعات
     */
    async getAllGroups(sessionId) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket) {
                throw new Error('Session not found');
            }
    
            // الحصول على قائمة المجموعات
            const groups = await socket.groupFetchAllParticipating();
            
            // تنسيق بيانات المجموعات
            const formattedGroups = await Promise.all(
                Object.entries(groups).map(async ([id, group]) => {
                    // محاولة جلب صورة المجموعة
                    let profilePicture = null;
                    try {
                        profilePicture = await socket.profilePictureUrl(id);
                    } catch (error) {
                        profilePicture = '';
                    }
    
                    // معالجة المشاركين
                    const participants = group.participants.map(participant => {
                        // تحويل رقم الهاتف إلى تنسيق مقروء
                        const phoneNumber = participant.id.split('@')[0];
                        
                        return {
                            id: participant.id,
                            admin: participant.admin,
                            isMe: socket.user?.id === participant.id,
                            name: phoneNumber, // استخدام رقم الهاتف كاسم
                            phoneNumber: phoneNumber
                        };
                    });
    
                    // تحديد المشرفين
                    const admins = participants.filter(p => p.admin);
    
                    // معلومات المالك
                    const ownerPhone = group.owner ? group.owner.split('@')[0] : '';
    
                    return {
                        id: id,
                        subject: group.subject || 'بدون اسم',
                        description: group.desc || '',
                        memberCount: group.participants.length,
                        creation: group.creation,
                        owner: group.owner,
                        ownerPhone: ownerPhone,
                        profilePicture: profilePicture,
                        participants: participants,
                        admins: admins,
                        iAmAdmin: participants.some(p => p.isMe && p.admin),
                        // معلومات إضافية
                        announce: group.announce || false,
                        restrict: group.restrict || false,
                        ephemeralDuration: group.ephemeralDuration || 0,
                        // معلومات إحصائية
                        stats: {
                            adminsCount: admins.length,
                            membersCount: participants.length - admins.length
                        },
                        // تنسيق التواريخ
                        formattedCreation: group.creation ? new Date(group.creation * 1000).toLocaleString('ar-SA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        }) : 'غير متوفر'
                    };
                })
            );
    
            // ترتيب المجموعات حسب عدد الأعضاء
            formattedGroups.sort((a, b) => b.memberCount - a.memberCount);
    
            // إحصائيات شاملة
            const summary = {
                total: formattedGroups.length,
                asAdmin: formattedGroups.filter(g => g.iAmAdmin).length,
                totalParticipants: formattedGroups.reduce((sum, group) => sum + group.memberCount, 0),
                totalAdmins: formattedGroups.reduce((sum, group) => sum + group.stats.adminsCount, 0),
                totalMembers: formattedGroups.reduce((sum, group) => sum + group.stats.membersCount, 0),
                averageSize: Math.round(formattedGroups.reduce((sum, group) => sum + group.memberCount, 0) / formattedGroups.length),
                groups: formattedGroups,
                // إحصائيات إضافية
                stats: {
                    announcementGroups: formattedGroups.filter(g => g.announce).length,
                    restrictedGroups: formattedGroups.filter(g => g.restrict).length,
                    ephemeralGroups: formattedGroups.filter(g => g.ephemeralDuration > 0).length
                }
            };
    
            return summary;
    
        } catch (error) {
            console.error('Get groups error:', error);
            throw error;
        }
    }
    

    /**
     * البحث في المجموعات
     */
    async searchGroups(sessionId, query) {
        try {
            const allGroups = await this.getAllGroups(sessionId);
            const searchQuery = query.toLowerCase();

            const filteredGroups = allGroups.groups.filter(group => 
                group.subject.toLowerCase().includes(searchQuery) ||
                (group.description && group.description.toLowerCase().includes(searchQuery))
            );

            return {
                query: query,
                total: filteredGroups.length,
                groups: filteredGroups
            };

        } catch (error) {
            console.error('Search groups error:', error);
            throw error;
        }
    }

    /**
     * الحصول على معلومات المستخدم
     */
    async fetchUserInfo(socket, userId) {
        try {
            // تحقق من وجود المستخدم على واتساب
            const [contactInfo] = await socket.onWhatsApp(userId);
            if (!contactInfo?.exists) return null;
    
            const userInfo = {};
    
            // محاولة الحصول على معلومات المستخدم من store.chats
            try {
                const chats = await socket.store.chats;
                const chat = chats.get(userId);
                if (chat?.name) {
                    userInfo.pushName = chat.name;
                }
            } catch (error) {
                console.log('Could not fetch chat:', error);
            }
    
            // الحصول على الصورة
            try {
                userInfo.pictureUrl = await socket.profilePictureUrl(userId, 'image');
            } catch (error) {
                console.log('Could not fetch profile picture');
                userInfo.pictureUrl = null;
            }
    
            // الحصول على الحالة
            try {
                const status = await socket.fetchStatus(userId);
                userInfo.status = status?.status || '';
                userInfo.statusTimestamp = status?.setAt || '';
            } catch (error) {
                console.log('Could not fetch status');
                userInfo.status = '';
                userInfo.statusTimestamp = '';
            }
    
            return {
                id: userId,
                phoneNumber: userId.split('@')[0],
                name: userInfo.pushName || '',
                pictureUrl: userInfo.pictureUrl,
                status: userInfo.status,
                statusTimestamp: userInfo.statusTimestamp,
                exists: true
            };
    
        } catch (error) {
            console.error(`Error fetching user info for ${userId}:`, error);
            return {
                id: userId,
                phoneNumber: userId.split('@')[0],
                name: '',
                pictureUrl: null,
                status: '',
                exists: false
            };
        }
    }
    
    /**
     * الحصول على تفاصيل مجموعة محددة
     */
    async getGroupInfo(sessionId, groupId) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket) {
                throw new Error('Session not found');
            }
    
            const fullGroupId = groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;
            
            // الحصول على metadata المجموعة
            const groupMetadata = await socket.groupMetadata(fullGroupId);
    
            // الحصول على صورة المجموعة
            let groupPictureUrl = null;
            try {
                groupPictureUrl = await socket.profilePictureUrl(fullGroupId, 'image');
            } catch (error) {
                console.log('No group picture available');
            }
    
            // الحصول على معلومات المشاركين
            const participantsInfo = await Promise.all(
                groupMetadata.participants.map(async participant => {
                    // استخدام pushName مباشرة من metadata
                    const name = participant.pushName || '';
    
                    return {
                        id: participant.id,
                        phoneNumber: participant.id.split('@')[0],
                        name: name,
                        admin: participant.admin,
                        isSuperAdmin: participant.admin === 'superadmin',
                        isAdmin: !!participant.admin,
                        isMe: participant.id === socket.user.id,
                        pictureUrl: await socket.profilePictureUrl(participant.id, 'image').catch(() => null),
                        status: ''  // نترك الحالة فارغة لتحسين الأداء
                    };
                })
            );
    
            // تنظيم المشرفين
            const admins = participantsInfo.filter(p => p.admin);
    
            // تحقق من صلاحيات المستخدم الحالي
            const currentUserParticipant = participantsInfo.find(p => p.isMe);
            const iAmAdmin = currentUserParticipant?.isAdmin;
            const iAmSuperAdmin = currentUserParticipant?.isSuperAdmin;
    
            const detailedInfo = {
                basic: {
                    id: groupMetadata.id,
                    subject: groupMetadata.subject,
                    description: groupMetadata.desc || '',
                    creation: new Date(groupMetadata.creation * 1000).toISOString(),
                    pictureUrl: groupPictureUrl,
                    memberCount: participantsInfo.length
                },
                settings: {
                    announce: groupMetadata.announce,
                    restrict: groupMetadata.restrict,
                    ephemeralDuration: groupMetadata.ephemeralDuration
                },
                permissions: {
                    iAmParticipant: currentUserParticipant != null,
                    iAmAdmin,
                    iAmSuperAdmin,
                    canSendMessages: !groupMetadata.announce || iAmAdmin,
                    canModifySettings: !groupMetadata.restrict || iAmAdmin
                },
                members: {
                    participants: participantsInfo,
                    admins: admins
                }
            };
    
            // إضافة رابط الدعوة إذا كان المستخدم مشرف
            if (iAmAdmin) {
                try {
                    const inviteCode = await socket.groupInviteCode(fullGroupId);
                    if (inviteCode) {
                        detailedInfo.inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    }
                } catch (error) {
                    console.log('Could not fetch invite code');
                }
            }
    
            return detailedInfo;
    
        } catch (error) {
            console.error('Get group info error:', error);
            throw error;
        }
    }


    getSessions() {
        try {
            if (!this.sessions) {
                this.sessions = new Map();
            }
            return this.sessions;
        } catch (error) {
            console.error('Error getting sessions:', error);
            return new Map();
        }
    }

    /**
     * إضافة جلسة جديدة
     */
    addSession(sessionId, socket) {
        try {
            if (!this.sessions) {
                this.sessions = new Map();
            }
            this.sessions.set(sessionId, socket);
        } catch (error) {
            console.error('Error adding session:', error);
        }
    }

    /**
     * التحقق من وجود جلسة
     */
    hasSession(sessionId) {
        try {
            return this.sessions?.has(sessionId);
        } catch (error) {
            console.error('Error checking session:', error);
            return false;
        }
    }

    /**
     * حذف جلسة
     */
    removeSession(sessionId) {
        try {
            return this.sessions?.delete(sessionId);
        } catch (error) {
            console.error('Error removing session:', error);
            return false;
        }
    }


    async checkPhoneNumber(sessionId, phoneNumber) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket) {
                throw new Error('Session not found');
            }
    
            // تنظيف رقم الهاتف وإضافة + إذا لم تكن موجودة
            let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        
            // التحقق من الرقم
            const [result] = await socket.onWhatsApp(formattedNumber);
    
            if (!result || !result.exists) {
                return {
                    exists: false,
                    phoneNumber: formattedNumber
                };
            }
    
            let profileData = {
                name: null,
                pictureUrl: null,
                status: null
            };
    
            // جلب الاسم من pushName (إذا كان متاحًا)
            if (result.pushName) {
                profileData.name = result.pushName;
            }
    
            // إذا لم يتم العثور على الاسم، جلب معلومات الاتصال
            if (!profileData.name && socket.fetchContact) {
                try {
                    const contactInfo = await socket.fetchContact(result.jid);
                    profileData.name = contactInfo?.name || contactInfo?.notify || null;
                } catch (error) {
                    console.log('Error fetching contact info:', error);
                }
            }
    
            // إذا لم يتم العثور على الاسم، البحث في store.contacts (إذا كان متاحًا)
            if (!profileData.name && socket.store?.contacts) {
                try {
                    const contact = socket.store.contacts.get(result.jid);
                    if (contact?.name) {
                        profileData.name = contact.name;
                    }
                } catch (error) {
                    console.log('Error fetching contact from store:', error);
                }
            }
    
            // إذا لم يتم العثور على الاسم، نتركه فارغًا
            if (!profileData.name) {
                profileData.name = ''; // نترك الاسم فارغًا
            }
    
            // جلب الصورة الشخصية
            try {
                profileData.pictureUrl = await socket.profilePictureUrl(result.jid, 'image');
            } catch (error) {
                console.log('No profile picture available');
            }
    
            // جلب الحالة
            try {
                const status = await socket.fetchStatus(result.jid);
                profileData.status = status?.status || null;
            } catch (error) {
                console.log('No status available');
            }
    
            return {
                exists: true,
                phoneNumber: formattedNumber, // الرقم مع +
                jid: result.jid,
                profile: profileData
            };
    
        } catch (error) {
            console.error('Check phone number error:', error);
            throw error;
        }
    }

    // للتحقق من مجموعة أرقام
    async checkMultiplePhoneNumbers(sessionId, phoneNumbers) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket) {
                throw new Error('Session not found');
            }
    
            const formattedNumbers = phoneNumbers.map(number => {
                // تنظيف رقم الهاتف وإضافة + إذا لم تكن موجودة
                let formattedNumber = number.replace(/[^0-9]/g, '');
                return formattedNumber;
            });
    
            const results = await Promise.all(
                formattedNumbers.map(async (number) => {
                    try {
                        const [result] = await socket.onWhatsApp(number);
                        if (!result || !result.exists) {
                            return {
                                phoneNumber: number,
                                exists: false
                            };
                        }
    
                        let profileData = {
                            name: null,
                            pictureUrl: null,
                            status: null  // إضافة الحالة هنا
                        };
    
                        // جلب الاسم من pushName (إذا كان متاحًا)
                        if (result.pushName) {
                            profileData.name = result.pushName;
                        }
    
                        // إذا لم يتم العثور على الاسم، جلب معلومات الاتصال
                        if (!profileData.name && socket.fetchContact) {
                            try {
                                const contactInfo = await socket.fetchContact(result.jid);
                                profileData.name = contactInfo?.name || contactInfo?.notify || null;
                            } catch (error) {
                                console.log('Error fetching contact info:', error);
                            }
                        }
    
                        // إذا لم يتم العثور على الاسم، البحث في store.contacts (إذا كان متاحًا)
                        if (!profileData.name && socket.store?.contacts) {
                            try {
                                const contact = socket.store.contacts.get(result.jid);
                                if (contact?.name) {
                                    profileData.name = contact.name;
                                }
                            } catch (error) {
                                console.log('Error fetching contact from store:', error);
                            }
                        }
    
                        // إذا لم يتم العثور على الاسم، نتركه فارغًا
                        if (!profileData.name) {
                            profileData.name = ''; // نترك الاسم فارغًا
                        }
    
                        // جلب الصورة الشخصية
                        try {
                            profileData.pictureUrl = await socket.profilePictureUrl(result.jid, 'image');
                        } catch (error) {
                            console.log('No profile picture available');
                        }
    
                        // جلب الحالة
                        try {
                            const status = await socket.fetchStatus(result.jid);
                            profileData.status = status?.status || null;
                        } catch (error) {
                            console.log('No status available');
                        }
    
                        return {
                            phoneNumber: number, // الرقم مع +
                            exists: true,
                            jid: result.jid,
                            profile: profileData
                        };
                    } catch (error) {
                        return {
                            phoneNumber: number,
                            exists: false,
                            error: error.message
                        };
                    }
                })
            );
    
            return results;
        } catch (error) {
            console.error('Check multiple phone numbers error:', error);
            throw error;
        }
    }

    // ||||||||||||||||||||||||||||||||||||||||||||||||||||||
    async sendGroupMessage(sessionId, groupId, message) {
        try {
            const socket = this.sessions.get(sessionId);
            if (!socket) {
                throw new Error('Session not found');
            }
    
            // تنسيق معرف المجموعة
            let formattedGroupId = groupId;
            if (!groupId.endsWith('@g.us')) {
                formattedGroupId = `${groupId}@g.us`;
            }
    
            // الحصول على معلومات المجموعة
            let groupInfo;
            try {
                groupInfo = await socket.groupMetadata(formattedGroupId);
                if (!groupInfo) {
                    throw new Error('Group not found');
                }
            } catch (error) {
                throw new Error('Invalid group ID or group not accessible');
            }
    
            let sentMessage;
    
            switch (message.type.toLowerCase()) {
                case 'text':
                    sentMessage = await socket.sendMessage(formattedGroupId, { 
                        text: message.text 
                    });
                    break;
    
                case 'image':
                    sentMessage = await socket.sendMessage(formattedGroupId, {
                        image: { url: message.url },
                        caption: message.caption || ''
                    });
                    break;
    
                case 'video':
                    sentMessage = await socket.sendMessage(formattedGroupId, {
                        video: { url: message.url },
                        caption: message.caption || ''
                    });
                    break;
    
                case 'audio':
                    sentMessage = await socket.sendMessage(formattedGroupId, {
                        audio: { url: message.url },
                        mimetype: 'audio/mp4',
                        ptt: Boolean(message.ptt)
                    });
                    break;
    
                case 'document':
                    sentMessage = await socket.sendMessage(formattedGroupId, {
                        document: { url: message.url },
                        mimetype: message.mimeType || 'application/octet-stream',
                        fileName: message.fileName || 'document'
                    });
                    break;
    
                case 'location':
                    sentMessage = await socket.sendMessage(formattedGroupId, {
                        location: {
                            degreesLatitude: message.latitude,
                            degreesLongitude: message.longitude
                        }
                    });
                    break;
    
                case 'contact':
                    // تنسيق رقم الهاتف
                    const formattedNumber = message.phoneNumber.replace(/[^\d]/g, '');
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${message.name}\nTEL;type=CELL;type=VOICE;waid=${formattedNumber}:+${formattedNumber}\nEND:VCARD`;
                    
                    sentMessage = await socket.sendMessage(formattedGroupId, { 
                        contacts: {
                            displayName: message.name,
                            contacts: [{ vcard }]
                        }
                    });
                    break;
    
                default:
                    throw new Error('Unsupported message type');
            }
    
            // إرجاع تفاصيل الرسالة مع اسم المجموعة
            return {
                success: true,
                messageId: sentMessage.key.id,
                timestamp: sentMessage.messageTimestamp,
                status: 'sent',
                group: {
                    id: formattedGroupId,
                    name: groupInfo.subject, // اسم المجموعة
                    participants: groupInfo.participants.length // عدد المشاركين
                }
            };
    
        } catch (error) {
            console.error('Send group message error:', error);
            throw error;
        }
    }
    

    static getSocket(device_id) {
        return this.sessions.get(device_id) || null;
    }
}

module.exports = new WhatsAppManager();