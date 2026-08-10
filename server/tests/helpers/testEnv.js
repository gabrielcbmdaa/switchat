const mongoose = require('mongoose');
const request = require('supertest');

// Secretos ficticios y fijos. Los tests NO leen server/.env a propósito: deben dar el mismo
// resultado en tu mac y en CI, donde ese archivo no existe. Reciclar los secretos reales
// además haría que un test fallara por una configuración local en vez de por el código.
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); // 32 bytes = aes-256
delete process.env.REGISTRATION_ENABLED; // que un .env con el registro cerrado no los tumbe

const MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/switchat_test';

// ⛔ Los tests VACÍAN la base entre casos. Esta guarda es lo único que separa "borro datos
// de prueba" de "borro la base de desarrollo, o peor, producción por el túnel del 27018".
// Se comprueba el NOMBRE de la base, no la máquina: apuntar a un host correcto con la base
// equivocada es justo el despiste que hay que impedir.
const dbName = MONGO_URI.split('/').pop().split('?')[0];
if (!dbName.endsWith('_test')) {
    throw new Error(
        `Refusing to run the tests against "${dbName}": the database name must end in "_test". ` +
        `They wipe every collection between cases. Set MONGO_URI_TEST if you need another one.`
    );
}

async function connectTestDb() {
    await mongoose.connect(MONGO_URI);
}

async function disconnectTestDb() {
    await mongoose.disconnect();
}

// Se llama antes de CADA caso: un test no debe heredar lo que dejó el anterior, o pasa a
// depender del orden y falla de forma intermitente cuando alguien añade uno en medio.
async function clearTestDb() {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
        await collection.deleteMany({});
    }
}

/**
 * Registra una cuenta y devuelve su cookie de sesión, que es lo que identifica al usuario
 * en el resto de peticiones. Sin esto cada test repetiría seis líneas de preparación.
 */
async function registerUser(app, email) {
    const response = await request(app)
        .post('/api/auth/register')
        .send({ email, password: 'secreto123', acceptedTerms: true });

    if (response.status !== 201) {
        throw new Error(`Could not register ${email}: ${response.status} ${response.text}`);
    }

    return response.headers['set-cookie'];
}

module.exports = {
    MONGO_URI,
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    registerUser,
};
