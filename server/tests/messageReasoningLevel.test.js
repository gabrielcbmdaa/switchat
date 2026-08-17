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

// El nivel de esfuerzo es del mensaje, no del chat: Chat.reasoningLevel se mueve con el
// slider y estos tests cubren que la copia sellada en cada respuesta sobreviva al viaje.
describe('reasoningLevel on a message', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    let cookie;

    beforeEach(async () => {
        cookie = await registerUser(app, 'reasoning@test.local');
    });

    async function createChat(id) {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id, title: 'Chat', allowCreate: true })
            .expect(200);
    }

    async function readMessages(chatId) {
        const response = await request(app)
            .get(`/api/chats/${chatId}/messages`)
            .set('Cookie', cookie)
            .expect(200);

        return response.body;
    }

    test('an answer saved with a level comes back with the same level', async () => {
        await createChat('chat-level');

        await request(app)
            .post('/api/chats/chat-level/messages')
            .set('Cookie', cookie)
            .send({ sender: 'ai', content: 'La respuesta', model: 'gemini-3.5-flash', reasoningLevel: 'high' })
            .expect(201);

        const [message] = await readMessages('chat-level');
        assert.equal(message.model, 'gemini-3.5-flash');
        assert.equal(message.reasoningLevel, 'high');
    });

    // Todo lo guardado antes de que el campo existiera llega así, y es lo que la etiqueta
    // del cliente tiene que tolerar sin pintar un separador suelto.
    test('an answer saved without a level comes back without one', async () => {
        await createChat('chat-no-level');

        await request(app)
            .post('/api/chats/chat-no-level/messages')
            .set('Cookie', cookie)
            .send({ sender: 'ai', content: 'Una respuesta vieja', model: 'gemini-3.5-flash' })
            .expect(201);

        const [message] = await readMessages('chat-no-level');
        assert.equal(message.model, 'gemini-3.5-flash');
        assert.equal(message.reasoningLevel, undefined);
    });

    // El otro camino de entrada: los mensajes que un chat creado sin sesión trae consigo
    // cuando el usuario inicia sesión y el cliente los manda enteros en el body.
    test('the level survives when a chat arrives with its messages already written', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({
                id: 'chat-seeded',
                title: 'Sin sesión',
                allowCreate: true,
                messages: [
                    { role: 'user', parts: [{ text: 'La pregunta' }] },
                    { role: 'model', parts: [{ text: 'La respuesta' }], model: 'gemini-3.5-flash', reasoningLevel: 'low' },
                ],
            })
            .expect(200);

        const messages = await readMessages('chat-seeded');
        const answer = messages.find((message) => message.role === 'model');
        assert.equal(answer.reasoningLevel, 'low');
    });
});
