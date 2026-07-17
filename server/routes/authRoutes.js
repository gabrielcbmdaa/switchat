const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); // Traemos al cerebro de autenticación
const authMiddleware = require('../middleware/authMiddleware'); // 👈 Importamos el middleware de autorización

// Ventanilla de Registro
router.post('/register', authController.register); 

// Ventanilla de Login
router.post('/login', authController.login);

// Cerrar sesión
router.post('/logout', authController.logout);

// Obtener info del usuario actual (protegido por middleware)
router.get('/me', authMiddleware, authController.me);

// Exportamos el router para que el servidor principal lo conozca
module.exports = router;