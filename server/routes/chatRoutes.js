const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const chatController = require('../controllers/chatController');

router.post('/', authMiddleware, chatController.syncChat);
router.delete('/:id', authMiddleware, chatController.deleteChat);
router.post('/:chatId/messages', authMiddleware, chatController.createMessage);
router.get('/:chatId/messages', authMiddleware, chatController.getMessages);
router.delete('/:chatId/messages/:messageId', authMiddleware, chatController.deleteMessage);
router.get('/', authMiddleware, chatController.getChats); // 🔒 ¡Protegida!


module.exports = router;