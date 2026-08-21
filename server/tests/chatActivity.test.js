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

// La lista de chats se ordena por lastMessageAt, así que lo que se vigila aquí es que la
// fecha suba cuando debe, no baje cuando no debe, y falte cuando no hay nada que fechar.
describe('lastMessageAt on a chat', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    let cookie;

    beforeEach(async () => {
        cookie = await registerUser(app, 'activity@test.local');
    });

    async function createChat(id) {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id, title: 'A chat', allowCreate: true })
            .expect(200);
    }

    async function sendMessage(chatId, content) {
        const response = await request(app)
            .post(`/api/chats/${chatId}/messages`)
            .set('Cookie', cookie)
            .send({ sender: 'user', content })
            .expect(201);

        return response.body._id;
    }

    async function readChat(id) {
        const response = await request(app)
            .get('/api/chats')
            .set('Cookie', cookie)
            .expect(200);

        return response.body.find((chat) => chat.id === id);
    }

    test('a saved message dates the chat it belongs to', async () => {
        await createChat('chat-activity');
        await sendMessage('chat-activity', 'Hello');

        const chat = await readChat('chat-activity');
        assert.ok(chat.lastMessageAt, 'the chat came back with no lastMessageAt');
    });

    // El caso legado. Que el campo FALTE es lo que hace que el cliente recurra a createdAt en
    // vez de hundir el chat al fondo de la lista, así que un default aquí rompería el orden.
    test('a chat with no messages carries no date at all', async () => {
        await createChat('chat-empty');

        const chat = await readChat('chat-empty');
        assert.equal(chat.lastMessageAt, undefined);
    });

    test('a second message moves the date forward', async () => {
        await createChat('chat-two');
        await sendMessage('chat-two', 'First');
        const first = (await readChat('chat-two')).lastMessageAt;

        await sendMessage('chat-two', 'Second');
        const second = (await readChat('chat-two')).lastMessageAt;

        assert.ok(new Date(second) >= new Date(first), 'the date went backwards');
    });

    // El cliente manda el chat ENTERO cada vez que guarda un borrador o un título, y esa copia
    // puede ser anterior a la última respuesta. Sin la guarda de syncChat, guardar el título
    // justo después de responder devolvería el chat al fondo de la lista.
    test('saving the chat does not overwrite the date with a stale copy', async () => {
        await createChat('chat-stale');
        await sendMessage('chat-stale', 'Hello');
        const real = (await readChat('chat-stale')).lastMessageAt;

        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-stale', title: 'Renamed', lastMessageAt: '2020-01-01T00:00:00.000Z' })
            .expect(200);

        const chat = await readChat('chat-stale');
        assert.equal(new Date(chat.lastMessageAt).getTime(), new Date(real).getTime());
        assert.equal(chat.title, 'Renamed', 'the rest of the save should still go through');
    });

    test('deleting the newest message hands the date back to the previous one', async () => {
        await createChat('chat-delete');
        await sendMessage('chat-delete', 'First');
        const afterFirst = (await readChat('chat-delete')).lastMessageAt;

        const newestId = await sendMessage('chat-delete', 'Second');
        await request(app)
            .delete(`/api/chats/chat-delete/messages/${newestId}`)
            .set('Cookie', cookie)
            .expect(200);

        const chat = await readChat('chat-delete');
        assert.equal(new Date(chat.lastMessageAt).getTime(), new Date(afterFirst).getTime());
    });

    test('patching a message does not move the date', async () => {
        await createChat('chat-edit');
        const messageId = await sendMessage('chat-edit', 'Hello');
        const before = (await readChat('chat-edit')).lastMessageAt;

        await request(app)
            .patch(`/api/chats/chat-edit/messages/${messageId}`)
            .set('Cookie', cookie)
            .send({ content: 'Hello, edited' })
            .expect(200);

        const chat = await readChat('chat-edit');
        assert.equal(new Date(chat.lastMessageAt).getTime(), new Date(before).getTime());
    });

    test('deleting the only message leaves the chat with no date', async () => {
        await createChat('chat-last');
        const onlyId = await sendMessage('chat-last', 'Only');

        await request(app)
            .delete(`/api/chats/chat-last/messages/${onlyId}`)
            .set('Cookie', cookie)
            .expect(200);

        const chat = await readChat('chat-last');
        assert.equal(chat.lastMessageAt, undefined);
    });
});
