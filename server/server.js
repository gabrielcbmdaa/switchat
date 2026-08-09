const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Parche para Windows + Node v24

require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const app = require('./app');
const { assertEncryptionKey } = require('./services/encryptionService');

// Este archivo es el ARRANQUE del proceso: conexiones y puerto. La aplicación Express se
// construye en app.js, que se puede importar sin que nada de esto ocurra.

const PORT = process.env.PORT || 3000;

// ==========================================
// INICIALIZACIÓN DE BASES DE DATOS Y PUERTO
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
        console.log('🟢 Connected successfully to MongoDB (Mongoose)');

        // Conexión 2: MongoClient Nativo (Solo si lo usas en tus rutas externas)
        await client.connect();
        db = client.db();
        console.log("🍃 Connected successfully to MongoDB (Native Client)");

        // UN SOLO LISTEN: Levantamos el servidor una vez que las BD estén listas
        app.listen(PORT, () => {
            console.log(`🚀 Server running at: http://localhost:${PORT}`);

            if (process.env.REGISTRATION_ENABLED === 'false') {
                console.log('🔒 [Config] New account registration DISABLED (REGISTRATION_ENABLED=false).');
            }
        });

    } catch (error) {
        console.error("❌ Critical error while starting the server:", error);
        process.exit(1);
    }
}

startServer();
