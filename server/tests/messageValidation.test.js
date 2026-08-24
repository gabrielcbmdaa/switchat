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
const Message = require('../models/Message');

// A 500 is the server saying "my fault". These four requests are the caller's fault, and every
// one of them used to come back as a 500 carrying the raw exception text: the guards assumed
// content was a string and that anything in the :messageId slot could be looked up. What is
// checked here is the status code, because that is the whole difference between an error the
// client can act on and one that reads as the server being broken.
describe('a message request that is malformed', () => {
    before(connectTestDb);
    after(disconnectTestDb);
    beforeEach(clearTestDb);

    const CHAT_ID = 'chat-validation';
    let cookie;
    let messageId;

    beforeEach(async () => {
        cookie = await registerUser(app, 'validation@test.local');

        await request(app)
            .post('/api/chats')
            .set('Cookie', cookie)
            .send({ id: CHAT_ID, title: 'Validation', allowCreate: true })
            .expect(200);

        const created = await request(app)
            .post(`/api/chats/${CHAT_ID}/messages`)
            .set('Cookie', cookie)
            .send({ sender: 'user', content: 'the original wording' })
            .expect(201);

        messageId = created.body._id;
    });

    test('a numeric content is rejected when patching', async () => {
        await request(app)
            .patch(`/api/chats/${CHAT_ID}/messages/${messageId}`)
            .set('Cookie', cookie)
            .send({ content: 5 })
            .expect(400);

        const stored = await Message.findById(messageId);
        assert.equal(stored.content, 'the original wording');
    });

    test('a numeric content is rejected when creating', async () => {
        await request(app)
            .post(`/api/chats/${CHAT_ID}/messages`)
            .set('Cookie', cookie)
            .send({ sender: 'user', content: 5 })
            .expect(400);

        // One message in the chat, the one the setup wrote: nothing was stored by that request.
        const stored = await Message.find({ chatId: CHAT_ID });
        assert.equal(stored.length, 1);
    });

    test('an id that is not an id is a message that is not there', async () => {
        await request(app)
            .patch(`/api/chats/${CHAT_ID}/messages/not-an-id`)
            .set('Cookie', cookie)
            .send({ content: 'a new wording' })
            .expect(404);
    });

    test('the same goes for deleting', async () => {
        await request(app)
            .delete(`/api/chats/${CHAT_ID}/messages/not-an-id`)
            .set('Cookie', cookie)
            .expect(404);

        const stored = await Message.findById(messageId);
        assert.equal(stored.content, 'the original wording');
    });
});
