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

    test('a chat saved with notes comes back with the same text', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({
                id: 'chat-notes-text',
                title: 'With notebook',
                notesEnabled: true,
                notes: 'ship the notes reader first',
                allowCreate: true,
            })
            .expect(200);

        const response = await request(app)
            .get('/api/chats')
            .set('Cookie', cookie)
            .expect(200);

        const chat = response.body.find((item) => item.id === 'chat-notes-text');
        assert.equal(chat.notes, 'ship the notes reader first');
    });

    test('a chat saved without notes is not treated as having any', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-notes-blank', title: 'Old chat' })
            .expect(200);

        const response = await request(app)
            .get('/api/chats')
            .set('Cookie', cookie)
            .expect(200);

        const chat = response.body.find((item) => item.id === 'chat-notes-blank');
        assert.notEqual(chat.notes, 'ship the notes reader first');
        assert.ok(!chat.notes);
    });
});
