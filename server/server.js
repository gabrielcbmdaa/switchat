const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Workaround for Windows + Node v24

require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { assertEncryptionKey } = require('./services/encryptionService');

// This file is the process STARTUP: connection and port. The Express application is built
// in app.js, which can be imported without any of this happening.

const PORT = process.env.PORT || 3000;

// ==========================================
// DATABASE AND PORT INITIALIZATION
// ==========================================
async function startServer() {
    try {
        // First things first: without a valid ENCRYPTION_KEY we cannot hold API keys, and
        // it is better to learn that at startup than when a user tries to save one.
        assertEncryptionKey();

        // Mongoose owns the only connection to Mongo. Every model goes through it, so
        // opening a second pool with the native driver would buy nothing.
        await mongoose.connect(process.env.MONGO_URI);
        console.log('🟢 Connected successfully to MongoDB');

        // A SINGLE LISTEN: bring the server up once the database is ready
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
