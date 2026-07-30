const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); // Traemos al cerebro de autenticación
const authMiddleware = require('../middleware/authMiddleware'); // 👈 Importamos el middleware de autorización

// Ventanilla de Registro
router.post('/register', authController.register); 

// Ventanilla de Login
router.post('/login', authController.login);

// Cambiar email (requiere sesión activa)
router.patch('/email', authMiddleware, authController.updateEmail);

// Cambiar contraseña (requiere sesión activa)
router.patch('/password', authMiddleware, authController.updatePassword);

// Cerrar sesión
router.post('/logout', authController.logout);

// Obtener info del usuario actual (protegido por middleware)
router.get('/me', authMiddleware, authController.me);

// Exportamos el router para que el servidor principal lo conozca
module.exports = router;