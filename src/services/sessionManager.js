const fs = require('fs-extra');
const path = require('path');
const WhatsAppService = require('./whatsappService'); // استيراد خدمة WhatsApp
const { SESSIONS_DIR } = require('../config/constants'); // مسار مجلد الجلسات

class SessionManager {
    constructor() {
        this.sessionsDir = SESSIONS_DIR;
    }

    /**
     * فحص الجلسات الموجودة وإعادة الاتصال بها
     */
    async reconnectSessions() {
        try {
            // التحقق من وجود مجلد الجلسات
            if (!await fs.pathExists(this.sessionsDir)) {
                console.log('No sessions directory found.');
                return;
            }

            // قراءة محتويات مجلد الجلسات
            const sessionFolders = await fs.readdir(this.sessionsDir);

            if (sessionFolders.length === 0) {
                console.log('No sessions found.');
                return;
            }

            console.log(`Found ${sessionFolders.length} sessions. Attempting to reconnect...`);

            // إعادة الاتصال بكل جلسة
            for (const sessionId of sessionFolders) {
                try {
                    console.log(`Reconnecting session: ${sessionId}`);

                    // محاولة إعادة الاتصال بالجلسة
                    const result = await WhatsAppService.createConnection(sessionId);

                    if (result.success) {
                        console.log(`Session reconnected successfully: ${sessionId}`);
                    } else {
                        console.error(`Failed to reconnect session: ${sessionId}`);
                    }
                } catch (error) {
                    console.error(`Error reconnecting session ${sessionId}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error in reconnectSessions:', error.message);
        }
    }
}

module.exports = new SessionManager();