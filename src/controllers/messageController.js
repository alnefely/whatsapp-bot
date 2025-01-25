const { formatResponse } = require('../utils/helpers');
const whatsappService = require('../services/whatsappService');
const MessageService = require('../services/messageService');

// التحقق من وجود الجلسة
const checkSession = (sessionId, res) => {
    const sock = whatsappService.sessions.get(sessionId);
    if (!sock) {
        res.status(404).json(formatResponse(false, 'Session not found'));
        return null;
    }
    return sock;
};

class MessageController {
    // إرسال رسالة نصية
    static async sendText(req, res) {
        const { sessionId, to, message } = req.body;

        if (!sessionId || !to || !message) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendText(sock, to, message);
            res.json(formatResponse(true, 'Message sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send message', { error: error.message }));
        }
    }

    // إرسال صورة
    static async sendImage(req, res) {
        const { sessionId, to, image, caption } = req.body;

        if (!sessionId || !to || !image) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendImage(sock, to, image, caption);
            res.json(formatResponse(true, 'Image sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send image', { error: error.message }));
        }
    }

    // إرسال فيديو
    static async sendVideo(req, res) {
        const { sessionId, to, video, caption } = req.body;

        if (!sessionId || !to || !video) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendVideo(sock, to, video, caption);
            res.json(formatResponse(true, 'Video sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send video', { error: error.message }));
        }
    }

    // إرسال PDF
    static async sendPdf(req, res) {
        const { sessionId, to, pdf, fileName, caption } = req.body;

        if (!sessionId || !to || !pdf) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendPdf(sock, to, pdf, fileName, caption);
            res.json(formatResponse(true, 'PDF sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send PDF', { error: error.message }));
        }
    }

    // إرسال ملف صوتي
    static async sendAudio(req, res) {
        const { sessionId, to, audio, isVoiceNote } = req.body;

        if (!sessionId || !to || !audio) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendAudio(sock, to, audio, isVoiceNote);
            res.json(formatResponse(true, 'Audio sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send audio', { error: error.message }));
        }
    }

    // إرسال موقع
    static async sendLocation(req, res) {
        const { sessionId, to, latitude, longitude } = req.body;

        if (!sessionId || !to || !latitude || !longitude) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendLocation(sock, to, latitude, longitude);
            res.json(formatResponse(true, 'Location sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send location', { error: error.message }));
        }
    }

    // إرسال جهة اتصال
    static async sendContact(req, res) {
        const { sessionId, to, contactData } = req.body;

        if (!sessionId || !to || !contactData) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }

        const sock = checkSession(sessionId, res);
        if (!sock) return;

        const checkPhone = await whatsappService.checkPhoneNumber(sessionId, to);
        if( !checkPhone.exists ){
            return res.json(formatResponse(false, "Phone number not found on WhatsApp", checkPhone));
        }

        try {
            const result = await MessageService.sendContact(sock, to, contactData);
            res.json(formatResponse(true, 'Contact sent successfully', result));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to send contact', { error: error.message }));
        }
    }

    // إرسال رسائل جماعية
    static async sendBulk(req, res) {
        const { sessionId, numbers, message, type, mediaData } = req.body;
    
        if (!sessionId || !Array.isArray(numbers) || !message) {
            return res.status(400).json(formatResponse(false, 'Missing required parameters'));
        }
    
        const sock = checkSession(sessionId, res);
        if (!sock) return;
    
        try {
            // التحقق مما إذا كانت الأرقام تحتوي على واتساب
            const validNumbers = [];
            for (const number of numbers) {
                try {
                    const [result] = await sock.onWhatsApp(number);
                    if (result && result.exists) {
                        validNumbers.push(number);
                    }
                } catch (error) {
                    console.warn(`Failed to check WhatsApp status for ${number}:`, error.message);
                }
            }
    
            if (validNumbers.length === 0) {
                return res.status(400).json(formatResponse(false, 'No valid WhatsApp numbers found'));
            }
    
            // إرسال الرسائل فقط للأرقام الصالحة
            const results = await MessageService.sendBulk(sock, validNumbers, message, type, mediaData);
            res.json(formatResponse(true, 'Bulk messages processed', { results }));
        } catch (error) {
            res.status(500).json(formatResponse(false, 'Failed to process bulk messages', { error: error.message }));
        }
    }
}

module.exports = MessageController;