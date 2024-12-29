const AutoReplyService = require('../services/autoReplyService');

class AutoReplyController {
    static async addReply(req, res) {
        const { device_id, keyword, response, match_type } = req.body;

        if (!device_id || !keyword || !response) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        try {
            const reply = await AutoReplyService.addReply(
                device_id,
                keyword,
                response,
                match_type
            );
            res.json({
                success: true,
                message: 'Auto reply added successfully',
                data: reply
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to add auto reply',
                error: error.message
            });
        }
    }

    static async updateReply(req, res) {
        try {
            const { device_id, keyword, response, match_type } = req.body;

            // التحقق من وجود البيانات المطلوبة
            if (!device_id || !keyword || !response) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: device_id, keyword, and response are required',
                    data: null
                });
            }

            const result = await AutoReplyService.updateReply(device_id, keyword, {
                response,
                match_type: match_type || 'contains'
            });

            res.json({
                success: true,
                message: result.added ? 'Auto reply added successfully' : 'Auto reply updated successfully',
                data: result
            });
        } catch (error) {
            console.error('Update error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update auto reply',
                error: error.message
            });
        }
    }

    static async deleteReply(req, res) {
        try {
            const { device_id, keyword } = req.body;

            // التحقق من وجود البيانات المطلوبة
            if (!device_id || !keyword) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: device_id and keyword are required',
                    data: null
                });
            }

            const result = await AutoReplyService.deleteReply(device_id, keyword);

            res.json({
                success: true,
                message: result.message,
                data: result
            });
        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete auto reply',
                error: error.message
            });
        }
    }

    // دالة جديدة لحذف جميع الردود لجهاز معين
    static async deleteAllReplies(req, res) {
        try {
            const { device_id } = req.body;

            if (!device_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Device ID is required',
                    data: null
                });
            }

            const result = await AutoReplyService.deleteAllReplies(device_id);

            res.json({
                success: true,
                message: result.message,
                data: result
            });
        } catch (error) {
            console.error('Delete all error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete all replies',
                error: error.message
            });
        }
    }

    static async getReplies(req, res) {
        const { device_id } = req.params;

        if (!device_id) {
            return res.status(400).json({
                success: false,
                message: 'Device ID is required'
            });
        }

        try {
            const replies = await AutoReplyService.getReplies(device_id);
            res.json({
                success: true,
                message: 'Auto replies retrieved successfully',
                data: { replies }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to get auto replies',
                error: error.message
            });
        }
    }
}

module.exports = AutoReplyController;