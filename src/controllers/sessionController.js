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

    static async deleteDevice(req, res) {
        const { sessionId } = req.params;

        try {
            if (!sessionId) {
                return res.status(400).json(
                    formatResponse(false, 'Session ID is required')
                );
            }

            // التحقق من وجود الجهاز
            const exists = await whatsappService.deviceExists(sessionId);
            if (!exists) {
                return res.status(404).json(
                    formatResponse(false, 'Device not found')
                );
            }

            // حذف الجهاز
            const result = await whatsappService.deleteDevice(sessionId);

            res.json(formatResponse(true, 'Device deleted successfully', {
                sessionId,
                deleted: true,
                timestamp: new Date().toISOString()
            }));

        } catch (error) {
            console.error('Delete device error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to delete device', { 
                    error: error.message,
                    sessionId
                })
            );
        }
    }

    /**
     * حذف عدة أجهزة
     */
    static async deleteMultipleDevices(req, res) {
        const { sessionIds } = req.body;

        try {
            if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
                return res.status(400).json(
                    formatResponse(false, 'Session IDs array is required')
                );
            }

            const results = await Promise.allSettled(
                sessionIds.map(async (sessionId) => {
                    try {
                        const exists = await whatsappService.deviceExists(sessionId);
                        if (!exists) {
                            return {
                                sessionId,
                                success: false,
                                message: 'Device not found'
                            };
                        }

                        await whatsappService.deleteDevice(sessionId);
                        return {
                            sessionId,
                            success: true,
                            message: 'Deleted successfully'
                        };
                    } catch (error) {
                        return {
                            sessionId,
                            success: false,
                            message: error.message
                        };
                    }
                })
            );

            const summary = {
                total: sessionIds.length,
                successful: results.filter(r => r.value?.success).length,
                failed: results.filter(r => !r.value?.success).length,
                details: results.map(r => r.value)
            };

            res.json(formatResponse(true, 'Devices deletion completed', summary));

        } catch (error) {
            console.error('Delete multiple devices error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to delete devices', { 
                    error: error.message
                })
            );
        }
    }
    
    static async renameSession(req, res) {
        const { oldSessionId, newSessionId } = req.body;

        try {
            // التحقق من وجود البيانات المطلوبة
            if (!oldSessionId || !newSessionId) {
                return res.status(400).json(
                    formatResponse(false, 'Both old and new session IDs are required')
                );
            }

            // التحقق من صحة الأسماء
            try {
                whatsappService.validateSessionName(oldSessionId);
                whatsappService.validateSessionName(newSessionId);
            } catch (validationError) {
                return res.status(400).json(
                    formatResponse(false, validationError.message)
                );
            }

            // تنفيذ عملية تغيير الاسم
            const result = await whatsappService.renameSession(oldSessionId, newSessionId);

            res.json(formatResponse(true, 'Session renamed successfully', {
                oldSessionId,
                newSessionId,
                wasConnected: result.data.wasConnected,
                isConnected: result.data.isConnected,
                timestamp: new Date().toISOString()
            }));

        } catch (error) {
            console.error('Rename session error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to rename session', { 
                    error: error.message,
                    oldSessionId,
                    newSessionId
                })
            );
        }
    }
}

module.exports = SessionController;