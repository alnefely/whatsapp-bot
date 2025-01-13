const { formatResponse } = require('../utils/helpers');
const whatsappService = require('../services/whatsappService');

class GroupController {
    /**
     * الحصول على جميع المجموعات
     */
    static async getAllGroups(req, res) {
        const { sessionId } = req.params;

        try {
            if (!sessionId) {
                return res.status(400).json(
                    formatResponse(false, 'Session ID is required')
                );
            }

            // التحقق من حالة الاتصال
            const socket = whatsappService.sessions.get(sessionId);
            if (!socket || !(await whatsappService.checkConnectionState(socket))) {
                return res.status(400).json(
                    formatResponse(false, 'Session is not connected')
                );
            }

            const groups = await whatsappService.getAllGroups(sessionId);
            res.json(formatResponse(true, 'Groups retrieved successfully', groups));

        } catch (error) {
            console.error('Get groups error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to get groups', { 
                    error: error.message 
                })
            );
        }
    }

    /**
     * البحث في المجموعات
     */
    static async searchGroups(req, res) {
        const { sessionId } = req.params;
        const { query } = req.query;

        try {
            if (!sessionId) {
                return res.status(400).json(
                    formatResponse(false, 'Session ID is required')
                );
            }

            if (!query) {
                return res.status(400).json(
                    formatResponse(false, 'Search query is required')
                );
            }

            const results = await whatsappService.searchGroups(sessionId, query);
            res.json(formatResponse(true, 'Search completed', results));

        } catch (error) {
            console.error('Search groups error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to search groups', { 
                    error: error.message 
                })
            );
        }
    }

    /**
     * الحصول على تفاصيل مجموعة محددة
     */
    static async getGroupInfo(req, res) {
        const { sessionId, groupId } = req.params;

        try {
            if (!sessionId || !groupId) {
                return res.status(400).json(
                    formatResponse(false, 'Session ID and Group ID are required')
                );
            }

            // التحقق من حالة الاتصال
            const socket = whatsappService.sessions.get(sessionId);
            if (!socket || !(await whatsappService.checkConnectionState(socket))) {
                return res.status(400).json(
                    formatResponse(false, 'Session is not connected')
                );
            }

            const groupInfo = await whatsappService.getGroupInfo(sessionId, groupId);
            res.json(formatResponse(true, 'Group information retrieved successfully', groupInfo));

        } catch (error) {
            console.error('Get group info error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to get group information', { 
                    error: error.message,
                    groupId 
                })
            );
        }
    }


    static async sendGroupMessage(req, res) {
        const { sessionId } = req.params;
        const { groupId, message } = req.body;
    
        try {
            // التحقق من البيانات المطلوبة
            if (!sessionId || !groupId || !message || !message.type) {
                return res.status(400).json(
                    formatResponse(false, 'Session ID, Group ID, and message with type are required')
                );
            }
    
            // التحقق من نوع الرسالة والبيانات المطلوبة
            switch (message.type.toLowerCase()) {
                case 'text':
                    if (!message.text) {
                        return res.status(400).json(
                            formatResponse(false, 'Text message content is required')
                        );
                    }
                    break;
    
                case 'contact':
                    if (!message.name || !message.phoneNumber) {
                        return res.status(400).json(
                            formatResponse(false, 'Contact name and phone number are required')
                        );
                    }
                    break;
    
                case 'image':
                case 'video':
                case 'audio':
                case 'document':
                    if (!message.url) {
                        return res.status(400).json(
                            formatResponse(false, 'Media URL is required')
                        );
                    }
                    break;
    
                case 'location':
                    if (!message.latitude || !message.longitude) {
                        return res.status(400).json(
                            formatResponse(false, 'Latitude and longitude are required for location')
                        );
                    }
                    break;
    
                default:
                    return res.status(400).json(
                        formatResponse(false, 'Unsupported message type')
                    );
            }
    
            const result = await whatsappService.sendGroupMessage(sessionId, groupId, message);
            res.json(formatResponse(true, 'Message sent successfully', result));
    
        } catch (error) {
            console.error('Send group message error:', error);
            res.status(500).json(
                formatResponse(false, 'Failed to send message', {
                    error: error.message,
                    groupId
                })
            );
        }
    }


}

module.exports = GroupController;