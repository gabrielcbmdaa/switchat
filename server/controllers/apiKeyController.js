const ApiKey = require('../models/ApiKey');
const { encrypt, decrypt } = require('../services/encryptionService');

// Tope defensivo: AccountView maneja un puñado de keys, no cientos.
const MAX_KEYS_PER_USER = 50;

// ⚠️ Ningún log de este archivo debe incluir req.body ni el campo `key`: viajan en claro
// dentro de la petición y acabarían en texto plano en los logs del servidor.

// 🔑 OBTENER LAS API KEYS DEL USUARIO (descifradas)
// Devuelve texto plano por necesidad: es el navegador quien llama a los proveedores, así
// que necesita la clave utilizable. El cifrado protege un volcado de la base de datos,
// no una sesión robada.
exports.getApiKeys = async (req, res) => {
    try {
        const stored = await ApiKey.find({ userId: req.user.id }).sort({ createdAt: 1 });

        // Una key que no se puede descifrar (ENCRYPTION_KEY regenerada, dato corrupto) se
        // omite en lugar de romper la respuesta entera: para el cliente es indistinguible
        // de no tenerla guardada, y localStorage sigue siendo la fuente de verdad.
        const keys = stored.reduce((accumulated, doc) => {
            const plainKey = decrypt(doc.key);
            if (plainKey) {
                accumulated.push({ provider: doc.provider, key: plainKey, isActive: doc.isActive });
            }
            return accumulated;
        }, []);

        return res.json({ keys });

    } catch (error) {
        console.error('❌ Error en getApiKeys:', error.message);
        return res.status(500).json({ message: 'Error al leer las API keys' });
    }
};

// 🔑 REEMPLAZAR EL CONJUNTO COMPLETO DE API KEYS DEL USUARIO
// Es un reemplazo total, no un alta: el cliente ya tiene la lista entera en localStorage y
// es quien decide el resultado de la reconciliación. Así el borrado sale gratis —una key
// que no viene en el cuerpo deja de existir— en vez de necesitar su propio endpoint, que
// es justo lo que haría que una key borrada resucitase en el siguiente inicio de sesión.
exports.replaceApiKeys = async (req, res) => {
    try {
        const { keys } = req.body;

        if (!Array.isArray(keys)) {
            return res.status(400).json({ message: 'Se espera un array "keys"' });
        }

        if (keys.length > MAX_KEYS_PER_USER) {
            return res.status(400).json({ message: `No se pueden guardar más de ${MAX_KEYS_PER_USER} API keys` });
        }

        const activeProviders = new Set();
        const documents = [];

        for (const entry of keys) {
            const provider = typeof entry?.provider === 'string' ? entry.provider.trim().toLowerCase() : '';
            const plainKey = typeof entry?.key === 'string' ? entry.key.trim() : '';

            if (!provider || !plainKey) {
                return res.status(400).json({ message: 'Cada entrada necesita "provider" y "key" no vacíos' });
            }

            // El índice parcial ya lo impediría, pero fallar aquí da un error entendible
            // en vez de un E11000 de Mongo a medio camino de la inserción.
            const isActive = entry.isActive === true;
            if (isActive) {
                if (activeProviders.has(provider)) {
                    return res.status(400).json({ message: `Hay más de una key activa para ${provider}` });
                }
                activeProviders.add(provider);
            }

            documents.push({ userId: req.user.id, provider, key: encrypt(plainKey), isActive });
        }

        // Sin transacción: si el proceso muere entre el borrado y la inserción el usuario
        // se queda sin keys en el servidor, pero las conserva en localStorage. Iniciar
        // sesión ya no las vuelve a subir —sincronizar es una decisión explícita por
        // clave—, así que la pérdida sigue siendo recuperable, pero a mano.
        await ApiKey.deleteMany({ userId: req.user.id });
        if (documents.length > 0) {
            await ApiKey.insertMany(documents);
        }

        return res.json({ message: 'API keys sincronizadas', count: documents.length });

    } catch (error) {
        console.error('❌ Error en replaceApiKeys:', error.message);
        return res.status(500).json({ message: 'Error al guardar las API keys' });
    }
};
