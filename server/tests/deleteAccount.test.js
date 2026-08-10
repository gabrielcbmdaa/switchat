const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    registerUser,
} = require('./helpers/testEnv');

const app = require('../app');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const ApiKey = require('../models/ApiKey');

// Estos casos existen porque deleteAccount borraba Message, Chat y User pero se dejaba las
// ApiKey. El fallo era invisible: la respuesta era un 200 correcto y solo se veía mirando la
// base a mano. Un test unitario con Mongoose simulado habría pasado en verde igualmente.
describe('DELETE /api/auth/account', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    // Deja una cuenta con datos en las cuatro colecciones y devuelve su cookie
    async function accountWithData(email) {
        const cookie = await registerUser(app, email);

        await request(app)
            .put('/api/keys')
            .set('Cookie', cookie)
            .send({ keys: [{ provider: 'google', key: 'clave-de-prueba', isActive: true }] })
            .expect(200);

        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: `chat-${email}`, title: 'Conversación' })
            .expect(200);

        await request(app)
            .post(`/api/chats/chat-${email}/messages`)
            .set('Cookie', cookie)
            .send({ sender: 'user', content: 'hola' })
            .expect(201);

        return cookie;
    }

    test('erases the user, the chats, the messages and the API keys', async () => {
        const cookie = await accountWithData('duenyo@test.local');

        // Sin esta comprobación previa, un fallo en la preparación daría un test en verde
        // que en realidad no borró nada porque no había nada que borrar.
        assert.equal(await ApiKey.countDocuments(), 1);
        assert.equal(await Chat.countDocuments(), 1);
        assert.equal(await Message.countDocuments(), 1);

        await request(app)
            .delete('/api/auth/account')
            .set('Cookie', cookie)
            .send({ currentPassword: 'secreto123' })
            .expect(200);

        assert.equal(await User.countDocuments(), 0);
        assert.equal(await Chat.countDocuments(), 0);
        assert.equal(await Message.countDocuments(), 0);
        assert.equal(await ApiKey.countDocuments(), 0, 'las API keys quedaron huérfanas');
    });

    test('keeps everything when the password is wrong', async () => {
        const cookie = await accountWithData('duenyo@test.local');

        await request(app)
            .delete('/api/auth/account')
            .set('Cookie', cookie)
            .send({ currentPassword: 'contrasena-equivocada' })
            .expect(400);

        assert.equal(await User.countDocuments(), 1);
        assert.equal(await ApiKey.countDocuments(), 1);
        assert.equal(await Chat.countDocuments(), 1);
        assert.equal(await Message.countDocuments(), 1);
    });

    test('does not touch another account', async () => {
        const cookie = await accountWithData('duenyo@test.local');
        await accountWithData('vecino@test.local');

        await request(app)
            .delete('/api/auth/account')
            .set('Cookie', cookie)
            .send({ currentPassword: 'secreto123' })
            .expect(200);

        // El borrado filtra por userId; si alguien lo quitara, esto caería a 0.
        assert.equal(await User.countDocuments(), 1);
        assert.equal(await ApiKey.countDocuments(), 1);
        assert.equal(await Chat.countDocuments(), 1);
        assert.equal(await Message.countDocuments(), 1);
    });
});
