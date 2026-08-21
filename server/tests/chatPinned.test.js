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

// El pin lo decide el cliente y el servidor solo lo custodia, así que lo que se vigila aquí es
// el viaje de ida y vuelta: que suba, que baje, y sobre todo que se pueda DESFIJAR. Eso último
// es lo que separa un campo que se guarda de uno que solo se puede encender.
describe('pinned on a chat', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    let cookie;

    beforeEach(async () => {
        cookie = await registerUser(app, 'pinned@test.local');
    });

    async function saveChat(fields) {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send(fields)
            .expect(200);
    }

    async function readChat(id) {
        const response = await request(app)
            .get('/api/chats')
            .set('Cookie', cookie)
            .expect(200);

        return response.body.find((chat) => chat.id === id);
    }

    test('a chat saved as pinned comes back pinned', async () => {
        await saveChat({ id: 'chat-pinned', title: 'Pinned chat', pinned: true, allowCreate: true });

        const chat = await readChat('chat-pinned');
        assert.equal(chat.pinned, true);
    });

    // Un chat anterior al campo llega sin él, y el default es lo que impide que la lista tenga
    // que adivinar: se lee como no fijado, igual que uno que nadie fijó nunca.
    test('a chat saved without the field is not treated as pinned', async () => {
        await saveChat({ id: 'chat-plain', title: 'Old chat', allowCreate: true });

        const chat = await readChat('chat-plain');
        assert.notEqual(chat.pinned, true);
    });

    // Desfijar es una escritura como cualquier otra, no la ausencia del campo: si el false no
    // llegara a Mongo, el chat volvería a aparecer arriba en el siguiente inicio de sesión.
    test('unpinning a chat is stored, not just forgotten', async () => {
        await saveChat({ id: 'chat-toggle', title: 'Toggled chat', pinned: true, allowCreate: true });
        await saveChat({ id: 'chat-toggle', title: 'Toggled chat', pinned: false });

        const chat = await readChat('chat-toggle');
        assert.equal(chat.pinned, false);
    });
});
