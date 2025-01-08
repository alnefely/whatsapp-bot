const WhatsAppService = require('../services/whatsappService');

class WhatsAppController {
    async checkPhoneNumber(req, res) {
        try {
            const { sessionId, phoneNumber } = req.body;

            if (!sessionId || !phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Session ID and phone number are required'
                });
            }

            const result = await WhatsAppService.checkPhoneNumber(sessionId, phoneNumber);
            
            return res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Check phone number controller error:', error);
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async checkMultiplePhoneNumbers(req, res) {
        try {
            const { sessionId, phoneNumbers } = req.body;

            if (!sessionId || !Array.isArray(phoneNumbers)) {
                return res.status(400).json({
                    success: false,
                    message: 'Session ID and array of phone numbers are required'
                });
            }

            const results = await WhatsAppService.checkMultiplePhoneNumbers(sessionId, phoneNumbers);
            
            return res.json({
                success: true,
                data: results
            });

        } catch (error) {
            console.error('Check multiple phone numbers controller error:', error);
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new WhatsAppController();