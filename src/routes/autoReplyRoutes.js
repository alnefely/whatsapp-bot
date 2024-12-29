const express = require('express');
const router = express.Router();
const AutoReplyController = require('../controllers/autoReplyController');

router.post('/add', AutoReplyController.addReply);
router.put('/update', AutoReplyController.updateReply);

router.delete('/delete', AutoReplyController.deleteReply);
// حذف جميع الردود لجهاز معين
router.delete('/delete-all', AutoReplyController.deleteAllReplies);

router.get('/list/:device_id', AutoReplyController.getReplies);

module.exports = router;