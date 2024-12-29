const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');

// الرسائل النصية
router.post('/send/text', MessageController.sendText);

// الوسائط
router.post('/send/image', MessageController.sendImage);
router.post('/send/video', MessageController.sendVideo);
router.post('/send/audio', MessageController.sendAudio);
router.post('/send/pdf', MessageController.sendPdf);

// الموقع وجهات الاتصال
router.post('/send/location', MessageController.sendLocation);
router.post('/send/contact', MessageController.sendContact);

// الرسائل الجماعية
router.post('/bulk', MessageController.sendBulk);

module.exports = router;