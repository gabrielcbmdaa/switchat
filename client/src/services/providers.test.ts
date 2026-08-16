import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchFromProvider } from './providers';
import type { Message } from '../types';

const history: Message[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

/**
 * Stubs fetch with a valid Anthropic answer and returns a reader for the body that was
 * actually sent. Asserting on the request is the whole point: the bug this file guards
 * against is a request shape the API rejects with a 400, so a mocked response tells us
 * nothing unless we look at what went out.
 */
function stubAnthropicCall() {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'hi' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    return async function sentBody(model: string, reasoningLevel: string) {
        await fetchFromProvider(model, history, reasoningLevel);
        const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return JSON.parse(init.body) as Record<string, unknown>;
    };
}

let sentBody: (model: string, reasoningLevel: string) => Promise<Record<string, unknown>>;

beforeEach(() => {
    localStorage.setItem('anthropicApiKey', 'test-key');
    sentBody = stubAnthropicCall();
});

describe('sendToAnthropic — thinking shape per model', () => {
    it('sends adaptive thinking plus effort on models that removed budget_tokens', async () => {
        const body = await sentBody('claude-sonnet-5', 'high');

        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
    });

    it('never sends budget_tokens on those models: it is a 400 there', async () => {
        for (const model of ['claude-sonnet-5', 'claude-opus-4-8', 'claude-fable-5']) {
            const body = await sentBody(model, 'high');

            expect(JSON.stringify(body)).not.toContain('budget_tokens');
        }
    });

    it("translates our 'minimal' to 'low': the effort scale starts there", async () => {
        const body = await sentBody('claude-sonnet-5', 'minimal');

        expect(body.output_config).toEqual({ effort: 'low' });
    });

    it("turns thinking off with type 'disabled', not by omitting the field", async () => {
        const body = await sentBody('claude-opus-4-8', 'off');

        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body.output_config).toBeUndefined();
    });

    it('omits thinking entirely on a model whose thinking cannot be turned off', async () => {
        const body = await sentBody('claude-fable-5', 'high');

        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toEqual({ effort: 'high' });
    });

    it("falls back to the lowest effort when such a model is asked for 'off'", async () => {
        const body = await sentBody('claude-fable-5', 'off');

        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toEqual({ effort: 'low' });
    });

    it('keeps budget_tokens on the older model that still expects it', async () => {
        const body = await sentBody('claude-haiku-4-5', 'medium');

        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
        expect(body.output_config).toBeUndefined();
    });

    it("sends no thinking at all when that older model is asked for 'off'", async () => {
        const body = await sentBody('claude-haiku-4-5', 'off');

        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toBeUndefined();
    });
});
