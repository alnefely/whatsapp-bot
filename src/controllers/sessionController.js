const { formatResponse } = require('../utils/helpers');
const whatsappService = require('../services/whatsappService');

class SessionController {
    // إنشاء أو الحصول على جلسة
    static async createOrGetSession(req, res) {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json(formatResponse(false, 'Session ID is required'));
        }

        try {
            // التحقق من الجلسة الحالية
            const currentState = await SessionController.checkCurrentSession(sessionId);
            
            if (currentState.exists) {
                return res.json(formatResponse(true, currentState.message, currentState.data));
            }

            // إنشاء جلسة جديدة إذا لم تكن موجودة
            await whatsappService.createConnection(sessionId, res);

        } catch (error) {
            console.error('Session operation error:', error);
            res.status(500).json(formatResponse(false, 'Session operation failed', { 
                error: error.message 
            }));
        }
    }

    // تسجيل الخروج من جلسة
    static async logoutSession(req, res) {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json(formatResponse(false, 'Session ID is required'));
        }

        try {
            const session = whatsappService.sessions.get(sessionId);
            if (!session) {
                return res.status(404).json(formatResponse(false, 'Session not found'));
            }

            await whatsappService.cleanupSession(sessionId);
            res.json(formatResponse(true, 'Logged out successfully', {
                sessionId,
                status: 'logged_out'
            }));
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json(formatResponse(false, 'Logout failed', { 
                error: error.message 
            }));
        }
    }

    // الحصول على جميع الجلسات
    static async getAllSessions(req, res) {
        try {
            const sessions = await whatsappService.getAllSessions();
            res.json(formatResponse(true, 'Sessions retrieved successfully', sessions));
        } catch (error) {
            console.error('Get sessions error:', error);
            res.status(500).json(formatResponse(false, 'Failed to get sessions', { 
                error: error.message 
            }));
        }
    }

    // دالة مساعدة للتحقق من حالة الجلسة الحالية
    static async checkCurrentSession(sessionId) {
        const sock = whatsappService.sessions.get(sessionId);
        const state = whatsappService.connectionStates.get(sessionId);
        const qrCode = whatsappService.qrCodes.get(sessionId);

        if (!sock) {
            return {
                exists: false
            };
        }

        try {
            const isConnected = await whatsappService.checkConnectionState(sock);

            if (isConnected) {
                return {
                    exists: true,
                    message: 'Session connected',
                    data: {
                        sessionId,
                        status: 'connected',
                        user: sock.user,
                        connectionInfo: {
                            attempts: state?.attempts || 0,
                            connected: true
                        }
                    }
                };
            } else if (qrCode) {
                return {
                    exists: true,
                    message: 'Session waiting for scan',
                    data: {
                        sessionId,
                        status: 'waiting_for_scan',
                        qrCode,
                        connectionInfo: {
                            attempts: state?.attempts || 0,
                            connected: false
                        }
                    }
                };
            }

            return {
                exists: false
            };
        } catch (error) {
            console.error('Session check error:', error);
            return {
                exists: false,
                error: error.message
            };
        }
    }

    // التحقق من حالة جلسة محددة
    static async checkSession(req, res) {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json(formatResponse(false, 'Session ID is required'));
        }

        try {
            const sessionState = await SessionController.checkCurrentSession(sessionId);
            
            if (sessionState.exists) {
                res.json(formatResponse(true, sessionState.message, sessionState.data));
            } else {
                res.status(404).json(formatResponse(false, 'Session not found or invalid'));
            }
        } catch (error) {
            console.error('Session check error:', error);
            res.status(500).json(formatResponse(false, 'Failed to check session', { 
                error: error.message 
            }));
        }
    }
}

module.exports = SessionController;