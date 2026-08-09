const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // 👈 Importamos cookie-parser
const path = require('node:path'); // 👈 Importamos 'path' para manejar rutas de archivos
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');

// Este archivo SOLO construye la aplicación: no conecta a la base de datos ni ocupa un
// puerto. Esa separación es lo que permite que los tests la importen y le manden peticiones
// en memoria, contra la base que ellos elijan. Mientras `require` arrancaba el servidor de
// verdad, cualquier test tenía que hablar por HTTP con un proceso ya levantado, y no podía
// decidir contra qué base corría. El arranque vive en server.js.

const app = express();

// ==========================================
// 1. MIDDLEWARES
// ==========================================
app.use(cors({
    origin: true,        // Permite cualquier origen (o el de tu frontend)
    credentials: true    // 👈 Permite recibir y enviar cookies a través de CORS
}));
app.use(cookieParser()); // 👈 Le enseña a Express a leer las cookies
app.use(express.json());

// ==========================================
// 2. RUTAS DE LA API (Siempre van ARRIBA)
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/keys', apiKeyRoutes);

// ==========================================
// 3. SERVIR ARCHIVOS ESTÁTICOS DE REACT
// ==========================================
// Apuntamos a la carpeta 'dist' que generó 'pnpm build'
app.use(express.static(path.join(__dirname, '../client/dist')));

// El "Catch-all": Cualquier ruta que NO sea de la API, le entrega el index.html de React
// Esto es vital para que las aplicaciones Single Page Application (SPA) no den error 404 al recargar
// 🟢 Esto funciona perfecto en Express 5
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

module.exports = app;
