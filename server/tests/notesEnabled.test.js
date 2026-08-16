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

describe('notesEnabled on a chat', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    let cookie;

    beforeEach(async () => {
        cookie = await registerUser(app, 'notes@test.local');
    });

    test('a chat saved with the switch on comes back with the switch on', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-notes-on', title: 'With notes', notesEnabled: true, allowCreate: true })
            .expect(200);

        const response = await request(app)
            .get('/api/chats')
            .set('Cookie', cookie)
            .expect(200);

        const chat = response.body.find((item) => item.id === 'chat-notes-on');
        assert.equal(chat.notesEnabled, true);
    });

    test('a chat saved without the field is not treated as on', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-notes-missing', title: 'Old chat', allowCreate: true })
            .expect(200);

        const response = await request(app)
            .get('/api/chats')
            .set('Cookie', cookie)
            .expect(200);

        const chat = response.body.find((item) => item.id === 'chat-notes-missing');
        assert.notEqual(chat.notesEnabled, true);
    });

    test('the notebook text is not stored on the chat document', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({
                id: 'chat-notes-stray',
                title: 'Stray field',
                notesEnabled: true,
                notes: 'secret notebook that must not land in mongo',
                allowCreate: true,
            })
            .expect(200);

        const raw = await Chat.collection.findOne({ id: 'chat-notes-stray' });
        assert.equal(raw.notesEnabled, true);
        assert.equal(raw.notes, undefined);
    });
});
