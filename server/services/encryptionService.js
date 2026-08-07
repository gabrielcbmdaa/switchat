/**
 * Cifrado simétrico para secretos que el servidor CUSTODIA pero no usa: hoy, las API keys
 * que el usuario sincroniza entre dispositivos.
 *
 * Protege contra una fuga de la base de datos (una copia de seguridad mal guardada, una
 * cadena de conexión filtrada), no contra el compromiso total de la máquina: quien tenga
 * el .env tiene la clave. Es la amenaza realista, y es la que se cubre.
 */

const crypto = require('node:crypto');

// GCM es cifrado *autenticado*: si alguien manipula el ciphertext, descifrar falla en vez
// de devolver basura en silencio. Esa es la razón de elegirlo sobre CBC.
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 32 bytes = 256 bits, lo que exige aes-256
const IV_LENGTH = 12;  // 12 bytes es el tamaño recomendado para GCM
const KEY_HINT = 'Genérala con: openssl rand -base64 32';

// Versiona el FORMATO, no la clave: permite cambiar de algoritmo más adelante sin
// invalidar lo ya guardado, porque cada registro dice con qué esquema se escribió.
const FORMAT_VERSION = 'v1';

/**
 * Lee y valida ENCRYPTION_KEY. Debe ser un secreto propio, nunca JWT_SECRET reciclado:
 * secretos distintos para propósitos distintos, para que filtrar uno no arrastre al otro.
 */
function loadEncryptionKey() {
    const rawKey = process.env.ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error(`Falta ENCRYPTION_KEY en server/.env. ${KEY_HINT}`);
    }

    const key = Buffer.from(rawKey, 'base64');
    if (key.length !== KEY_LENGTH) {
        throw new Error(
            `ENCRYPTION_KEY debe decodificar a ${KEY_LENGTH} bytes y decodifica a ${key.length}. ${KEY_HINT}`
        );
    }

    return key;
}

/**
 * Comprobación de arranque. Sin ella, una clave ausente o del tamaño equivocado no se
 * detecta hasta que alguien guarda una key, y lo hace con un error opaco de crypto.
 */
function assertEncryptionKey() {
    loadEncryptionKey();
}

/**
 * Cifra texto plano y devuelve `v1:iv:authTag:ciphertext`, todo en base64.
 * El separador es seguro porque base64 nunca contiene ':'.
 */
function encrypt(plainText) {
    const key = loadEncryptionKey();

    // IV nuevo POR REGISTRO. Reutilizar un IV en GCM no debilita el cifrado: lo rompe,
    // permitiendo recuperar el texto plano. Es el error clásico de este modo.
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        FORMAT_VERSION,
        iv.toString('base64'),
        authTag.toString('base64'),
        ciphertext.toString('base64'),
    ].join(':');
}

/**
 * Descifra lo que produjo `encrypt`. Devuelve null —nunca lanza— si el valor está
 * corrupto, tiene otro formato o se cifró con otra clave.
 *
 * Es deliberado: el .env solo vive en el VPS, así que regenerarlo convierte todo lo
 * almacenado en basura permanente. Como localStorage sigue siendo la fuente de verdad de
 * las API keys, ese estado es recuperable tratándolo como "no hay nada guardado". Si en
 * cambio reventara con un 500, dejaría la vista de cuenta rota y sin salida evidente.
 */
function decrypt(storedValue) {
    if (!storedValue || typeof storedValue !== 'string') return null;

    try {
        const [version, ivBase64, authTagBase64, ciphertextBase64] = storedValue.split(':');
        if (version !== FORMAT_VERSION || !ivBase64 || !authTagBase64 || !ciphertextBase64) {
            return null;
        }

        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            loadEncryptionKey(),
            Buffer.from(ivBase64, 'base64')
        );
        decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

        return Buffer.concat([
            decipher.update(Buffer.from(ciphertextBase64, 'base64')),
            decipher.final(),
        ]).toString('utf8');

    } catch {
        // Clave cambiada, dato manipulado o formato inesperado: para quien llama es
        // indistinguible de no tener nada guardado, que es justo como debe tratarse.
        return null;
    }
}

module.exports = {
    encrypt,
    decrypt,
    assertEncryptionKey,
};
