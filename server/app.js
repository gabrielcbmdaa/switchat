const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('node:path');
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
// Nothing the app does is cross-origin: the client calls the relative path `/api`, so in
// development the browser talks to Vite (which proxies to Express behind the scenes) and in
// production it talks to this same server, which serves the bundle too. CORS is therefore a
// backstop rather than a requirement.
//
// It used to be `origin: true`, which echoes back whatever Origin the caller sends — an open
// door paired with `credentials: true`. The sameSite cookie is what kept that from being
// exploitable, meaning a single word in authController stood between a stranger's page and
// the routes that hand out API keys. A backstop that trusts everyone is not a backstop.
//
// ALLOWED_ORIGINS is a comma-separated list; production sets it to the real domain.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(cookieParser());
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
