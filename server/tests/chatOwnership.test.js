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
const Chat = require('../models/Chat');
const Message = require('../models/Message');

// Cada caso monta dos sesiones reales, VICTIMA y ATACANTE, y comprueba que el atacante no
// alcanza lo ajeno usando solo su propia cookie. Hacen falta dos usuarios de verdad: el bug
// original era un filtro `userId` que faltaba en la consulta, y con una sola cuenta —o con
// la base simulada— la consulta incorrecta devuelve exactamente lo mismo que la correcta.
describe('propiedad del chat', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    const CHAT_ID = 'chat-privado-de-la-victima';
    let victima;
    let atacante;
    let messageId;

    beforeEach(async () => {
        victima = await registerUser(app, 'victima@test.local');
        atacante = await registerUser(app, 'atacante@test.local');

        await request(app)
            .post('/api/chats')
            .set('Cookie', victima)
            .send({ id: CHAT_ID, title: 'Mis cosas privadas', allowCreate: true })
            .expect(200);

        const created = await request(app)
            .post(`/api/chats/${CHAT_ID}/messages`)
            .set('Cookie', victima)
            .send({ sender: 'user', content: 'mi numero de tarjeta es 1234-5678' })
            .expect(201);

        messageId = created.body._id;
    });

    describe('GET /api/chats/:chatId/messages', () => {
        test('the owner reads their own messages', async () => {
            const response = await request(app)
                .get(`/api/chats/${CHAT_ID}/messages`)
                .set('Cookie', victima)
                .expect(200);

            assert.equal(response.body.length, 1);
            assert.equal(response.body[0].parts[0].text, 'mi numero de tarjeta es 1234-5678');
        });

        test('a stranger gets a 404 instead of the conversation', async () => {
            await request(app)
                .get(`/api/chats/${CHAT_ID}/messages`)
                .set('Cookie', atacante)
                .expect(404);
        });
    });

    describe('DELETE /api/chats/:id', () => {
        test('the owner deletes their chat and its messages', async () => {
            await request(app)
                .delete(`/api/chats/${CHAT_ID}`)
                .set('Cookie', victima)
                .expect(200);

            assert.equal(await Chat.countDocuments({ id: CHAT_ID }), 0);
            assert.equal(await Message.countDocuments({ chatId: CHAT_ID }), 0);
        });

        test('a stranger cannot delete it', async () => {
            await request(app)
                .delete(`/api/chats/${CHAT_ID}`)
                .set('Cookie', atacante)
                .expect(404);

            // El 404 por sí solo no basta: lo que importa es que el chat siga ahí. La
            // versión con el fallo respondía 200 y borraba, pero un 404 con el borrado
            // hecho igualmente sería aún peor, y solo esta comprobación lo detecta.
            assert.equal(await Chat.countDocuments({ id: CHAT_ID }), 1);
            assert.equal(await Message.countDocuments({ chatId: CHAT_ID }), 1);
        });
    });

    describe('DELETE /api/chats/:chatId/messages/:messageId', () => {
        test('the owner deletes their own message', async () => {
            await request(app)
                .delete(`/api/chats/${CHAT_ID}/messages/${messageId}`)
                .set('Cookie', victima)
                .expect(200);

            assert.equal(await Message.countDocuments({ _id: messageId }), 0);
        });

        test('a stranger cannot delete it', async () => {
            await request(app)
                .delete(`/api/chats/${CHAT_ID}/messages/${messageId}`)
                .set('Cookie', atacante)
                .expect(404);

            assert.equal(await Message.countDocuments({ _id: messageId }), 1);
        });

        test('an owned chatId does not unlock a foreign messageId', async () => {
            // El atacante crea un chat SUYO y lo usa como llave: la comprobación del chat
            // padre pasa, porque ese chat sí es suyo. Lo que frena el ataque es que el
            // borrado se acota además por chatId. Sin esa segunda guarda el arreglo tendría
            // un hueco, y este es el único caso que lo cubre.
            await request(app)
                .post('/api/chats')
                .set('Cookie', atacante)
                .send({ id: 'chat-senyuelo', title: 'Señuelo', allowCreate: true })
                .expect(200);

            await request(app)
                .delete(`/api/chats/chat-senyuelo/messages/${messageId}`)
                .set('Cookie', atacante)
                .expect(404);

            assert.equal(await Message.countDocuments({ _id: messageId }), 1);
        });
    });
});
