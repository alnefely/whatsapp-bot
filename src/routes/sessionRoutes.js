const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// نستخدم endpoint واحد للإنشاء والتحقق من الحالة
router.post('/create', sessionController.createOrGetSession);
router.post('/logout/:sessionId', sessionController.logoutSession);
router.get('/list', sessionController.getAllSessions);

module.exports = router;