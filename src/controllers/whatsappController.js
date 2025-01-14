const WhatsAppService = require('../services/whatsappService');

class WhatsAppController {
    /**
     * التحقق من رقم هاتف واحد
     */
    async checkPhoneNumber(req, res) {
        try {
            const { sessionId, phoneNumber } = req.body;

            // التحقق من وجود sessionId و phoneNumber
            if (!sessionId || !phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Session ID and phone number are required'
                });
            }

            // إضافة + تلقائيًا إذا لم تكن موجودة
            const formattedPhoneNumber = this.formatPhoneNumber(phoneNumber);

            // التحقق من صحة رقم الهاتف
            if (!this.isValidPhoneNumber(formattedPhoneNumber)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number format. Please use a valid phone number (e.g., 201270947759 or +201270947759)'
                });
            }

            // التحقق من رقم الهاتف باستخدام الخدمة
            const result = await WhatsAppService.checkPhoneNumber(sessionId, formattedPhoneNumber);

            // إرجاع النتيجة
            return res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Check phone number controller error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Internal server error'
            });
        }
    }

    /**
     * التحقق من عدة أرقام هواتف
     */
    async checkMultiplePhoneNumbers(req, res) {
        try {
            const { sessionId, phoneNumbers } = req.body;

            // التحقق من وجود sessionId و phoneNumbers
            if (!sessionId || !Array.isArray(phoneNumbers)) {
                return res.status(400).json({
                    success: false,
                    message: 'Session ID and array of phone numbers are required'
                });
            }

            // تنسيق الأرقام والتحقق من صحتها
            const formattedPhoneNumbers = phoneNumbers.map(phoneNumber => this.formatPhoneNumber(phoneNumber));
            for (const phoneNumber of formattedPhoneNumbers) {
                if (!this.isValidPhoneNumber(phoneNumber)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid phone number format: ${phoneNumber}. Please use a valid phone number (e.g., 201270947759 or +201270947759)`
                    });
                }
            }

            // التحقق من الأرقام باستخدام الخدمة
            const results = await WhatsAppService.checkMultiplePhoneNumbers(sessionId, formattedPhoneNumbers);

            // إرجاع النتيجة
            return res.json({
                success: true,
                data: results
            });

        } catch (error) {
            console.error('Check multiple phone numbers controller error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Internal server error'
            });
        }
    }

    /**
     * تنسيق رقم الهاتف بإضافة + إذا لم تكن موجودة
     */
    formatPhoneNumber(phoneNumber) {
        return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    }

    /**
     * التحقق من صحة رقم الهاتف
     */
    isValidPhoneNumber(phoneNumber) {
        const regex = /^\+\d{1,3}\d{9,14}$/; // تنسيق رقم الهاتف الدولي
        return regex.test(phoneNumber);
    }
}

module.exports = new WhatsAppController();