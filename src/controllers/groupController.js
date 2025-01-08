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

    
}

module.exports = GroupController;