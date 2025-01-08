const express = require('express');
const router = express.Router();
const WhatsAppController = require('../controllers/whatsappController');

// ... الراوترز الأخرى الموجودة مسبقاً ...

// إضافة راوتر للتحقق من رقم الهاتف
router.post('/check-phone', WhatsAppController.checkPhoneNumber.bind(WhatsAppController));

router.post('/check-phones', WhatsAppController.checkMultiplePhoneNumbers.bind(WhatsAppController));

module.exports = router;