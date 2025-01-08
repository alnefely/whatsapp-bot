const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');


// الصفحة الرئيسية
router.get('/', (req, res) => {
    res.render('dashboard'); // سنقوم بإنشاء هذا القالب لاحقاً
});

// API لمعلومات لوحة التحكم
router.get('/api/dashboard', dashboardController.getDashboardInfo);

module.exports = router;