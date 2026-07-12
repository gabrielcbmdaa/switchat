const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); // Traemos al cerebro de autenticación

// Ventanilla de Registro
router.post('/register', authController.register); 

// Ventanilla de Login
router.post('/login', authController.login);

// Exportamos el router para que el servidor principal lo conozca
module.exports = router;