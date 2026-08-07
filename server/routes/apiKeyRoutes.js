const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const apiKeyController = require('../controllers/apiKeyController');

router.get('/', authMiddleware, apiKeyController.getApiKeys);
router.put('/', authMiddleware, apiKeyController.replaceApiKeys);

module.exports = router;
