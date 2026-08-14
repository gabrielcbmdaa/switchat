const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

// app.js reads ALLOWED_ORIGINS once, at require time, so it has to be set before the import
// below. It is also set explicitly rather than relying on the default, for the same reason
// testEnv pins the other secrets: the result must not depend on what server/.env happens to
// say on this machine.
const ALLOWED = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = ALLOWED;

const app = require('../app');

// These cases need no database: an unauthenticated request is rejected by authMiddleware
// before any query runs, and a preflight never reaches a route at all.
//
// The header being asserted is a permission slip. The browser refuses to hand a cross-site
// response to the calling page unless the server names that page's origin in it, so an
// absent header is the "no" being checked for. The setting used to be `origin: true`, which
// echoes back whatever Origin arrives — a yes to everyone — while `credentials: true` was
// also set. Only the sameSite cookie made that unexploitable, which left one word in
// authController standing between a stranger's page and /api/keys.
describe('CORS allowlist', () => {
    const STRANGER = 'https://not-switchat.example';

    test('names the configured origin, so its page may read the response', async () => {
        const response = await request(app)
            .get('/api/auth/me')
            .set('Origin', ALLOWED);

        assert.equal(response.headers['access-control-allow-origin'], ALLOWED);
        assert.equal(response.headers['access-control-allow-credentials'], 'true');
    });

    test('names nobody when an unknown origin asks', async () => {
        const response = await request(app)
            .get('/api/auth/me')
            .set('Origin', STRANGER);

        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });

    // The preflight is the question the browser asks before a write it considers risky. A
    // PUT to /api/keys replaces the user's stored provider keys, so this is the exact call
    // that must never be granted to a page nobody vouched for.
    test('refuses the preflight of an unknown origin', async () => {
        const response = await request(app)
            .options('/api/keys')
            .set('Origin', STRANGER)
            .set('Access-Control-Request-Method', 'PUT');

        assert.equal(response.headers['access-control-allow-origin'], undefined);
    });
});
