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

// Leaving a chat sends its draft to POST /api/chats, and that route upserts. If the user
// deletes that same chat right after, the two requests race: the client cannot unsend the
// sync it already put on the wire, so the server has to be the one that refuses it.
describe('a sync that arrives after the chat was deleted', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    let cookie;

    beforeEach(async () => {
        cookie = await registerUser(app, 'resurrection@test.local');
    });

    test('does not bring the chat back', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-ghost', title: 'About to be deleted', allowCreate: true })
            .expect(200);

        await request(app)
            .delete('/api/chats/chat-ghost')
            .set('Cookie', cookie)
            .expect(200);

        // The late sync: same body the client had already sent before pressing delete.
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-ghost', title: 'About to be deleted' });

        const survivor = await Chat.collection.findOne({ id: 'chat-ghost' });
        assert.equal(survivor, null, 'the deleted chat came back');
    });

    test('does not bring its messages back either', async () => {
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: 'chat-ghost-msgs', title: 'With history', allowCreate: true })
            .expect(200);

        await request(app)
            .post('/api/chats/chat-ghost-msgs/messages')
            .set('Cookie', cookie)
            .send({ sender: 'user', content: 'a question nobody should read again' })
            .expect(201);

        await request(app)
            .delete('/api/chats/chat-ghost-msgs')
            .set('Cookie', cookie)
            .expect(200);

        // The client keeps the conversation in memory, so its late sync carries the messages
        // too, and syncChat reseeds them whenever the chat has none left.
        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({
                id: 'chat-ghost-msgs',
                title: 'With history',
                messages: [{ role: 'user', parts: [{ text: 'a question nobody should read again' }] }],
            });

        const messages = await Message.find({ chatId: 'chat-ghost-msgs' });
        assert.equal(messages.length, 0, 'the deleted conversation came back');
    });
});
