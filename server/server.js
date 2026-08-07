const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Parche para Windows + Node v24

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // 👈 Importamos cookie-parser
const path = require('node:path'); // 👈 Importamos 'path' para manejar rutas de archivos
const { MongoClient } = require('mongodb');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const { assertEncryptionKey } = require('./services/encryptionService');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ==========================================
// 4. INICIALIZACIÓN DE BASES DE DATOS Y PUERTO
// ==========================================
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function startServer() {
    try {
        // Antes que nada: sin una ENCRYPTION_KEY válida no podemos custodiar API keys, y
        // más vale saberlo al arrancar que cuando un usuario intente guardar la suya.
        assertEncryptionKey();

        // Conexión 1: Mongoose
        await mongoose.connect(process.env.MONGO_URI);
        console.log('🟢 Conectado con éxito a MongoDB Atlas (Mongoose)');

        // Conexión 2: MongoClient Nativo (Solo si lo usas en tus rutas externas)
        await client.connect();
        db = client.db();
        console.log("🍃 Connected successfully to MongoDB Atlas (Native Client)");

        // UN SOLO LISTEN: Levantamos el servidor una vez que las BD estén listas
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);

            if (process.env.REGISTRATION_ENABLED === 'false') {
                console.log('🔒 [Config] Registro de nuevas cuentas DESHABILITADO (REGISTRATION_ENABLED=false).');
            }
        });

    } catch (error) {
        console.error("❌ Error crítico al iniciar el servidor:", error);
        process.exit(1);
    }
}

startServer();