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

// A stopped answer is the only thing that cannot be reconstructed later: the text is there,
// but whether the model finished or the user cut it is lost unless it is stored at the cut.
describe('stopped on a message', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    let cookie;

    beforeEach(async () => {
        cookie = await registerUser(app, 'stopped@test.local');
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

    test('an answer saved as stopped comes back as stopped', async () => {
        await createChat('chat-stopped');

        await request(app)
            .post('/api/chats/chat-stopped/messages')
            .set('Cookie', cookie)
            .send({ sender: 'ai', content: 'Media respuesta', model: 'gemini-3.5-flash', stopped: true })
            .expect(201);

        const [message] = await readMessages('chat-stopped');
        assert.equal(message.stopped, true);
    });

    // Absent, not false: every answer stored before this field exists without it, and the
    // client reads absence as "the model finished".
    test('an answer saved without the mark comes back without the field', async () => {
        await createChat('chat-whole');

        await request(app)
            .post('/api/chats/chat-whole/messages')
            .set('Cookie', cookie)
            .send({ sender: 'ai', content: 'Respuesta entera', model: 'gemini-3.5-flash' })
            .expect(201);

        const [message] = await readMessages('chat-whole');
        assert.equal(message.stopped, undefined);
    });

    // The other way in: a conversation that lived in localStorage and travels whole in the
    // body when the user signs in. Without this, stopping offline and then registering
    // would lose the mark.
    test('the mark survives when a chat arrives with its messages already written', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({
                id: 'chat-seeded-stopped',
                title: 'Sin sesión',
                allowCreate: true,
                messages: [
                    { role: 'user', parts: [{ text: 'La pregunta' }] },
                    { role: 'model', parts: [{ text: 'Media respuesta' }], model: 'gemini-3.5-flash', stopped: true },
                ],
            })
            .expect(200);

        const messages = await readMessages('chat-seeded-stopped');
        const answer = messages.find((message) => message.role === 'model');
        assert.equal(answer.stopped, true);
    });
});
