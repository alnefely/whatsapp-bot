const express = require('express');
const router = express.Router();
const GroupController = require('../controllers/groupController');

// الحصول على جميع المجموعات
router.get('/list/:sessionId', GroupController.getAllGroups);

// البحث في المجموعات
router.get('/search/:sessionId', GroupController.searchGroups);

// الحصول على تفاصيل مجموعة محددة
router.get('/info/:sessionId/:groupId', GroupController.getGroupInfo);

module.exports = router;