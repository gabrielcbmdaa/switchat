import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchFromProvider } from './providers';
import type { Message } from '../types';

const history: Message[] = [{ role: 'user', parts: [{ text: 'hello' }] }];

const splitSystemHistory: Message[] = [
    { role: 'system', parts: [{ text: 'be brief' }] },
    { role: 'system', parts: [{ text: 'ship the notes reader first' }] },
    { role: 'user', parts: [{ text: 'hello' }] },
];

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

    return async function sentBody(model: string, reasoningLevel: string, messages: Message[] = history) {
        await fetchFromProvider(model, messages, reasoningLevel);
        const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return JSON.parse(init.body) as Record<string, unknown>;
    };
}

function stubGoogleCall() {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            candidates: [{ content: { parts: [{ text: 'hi' }] } }],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    return async function sentBody(messages: Message[]) {
        await fetchFromProvider('gemini-3.5-flash', messages, 'low');
        const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return JSON.parse(init.body) as Record<string, unknown>;
    };
}

function stubOpenAICall() {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            choices: [{ message: { content: 'hi' } }],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    return async function sentBody(messages: Message[]) {
        await fetchFromProvider('gpt-5.6-sol', messages, 'low');
        const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return JSON.parse(init.body) as Record<string, unknown>;
    };
}

describe('sendToAnthropic — thinking shape per model', () => {
    let sentBody: (model: string, reasoningLevel: string) => Promise<Record<string, unknown>>;

    beforeEach(() => {
        localStorage.setItem('anthropicApiKey', 'test-key');
        sentBody = stubAnthropicCall();
    });

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

describe('joined system prefix on cloud providers', () => {
    it('sends Google one systemInstruction part even if history had two system messages', async () => {
        localStorage.setItem('geminiApiKey', 'test-key');
        const sentBody = stubGoogleCall();

        const body = await sentBody(splitSystemHistory);
        const systemInstruction = body.systemInstruction as { parts: { text: string }[] };

        expect(systemInstruction.parts).toHaveLength(1);
        expect(systemInstruction.parts[0].text).toContain('be brief');
        expect(systemInstruction.parts[0].text).toContain('ship the notes reader first');
    });

    it('sends OpenAI one system message even if history had two', async () => {
        localStorage.setItem('openaiApiKey', 'test-key');
        const sentBody = stubOpenAICall();

        const body = await sentBody(splitSystemHistory);
        const messages = body.messages as { role: string; content: string }[];
        const systemMessages = messages.filter((message) => message.role === 'system');

        expect(systemMessages).toHaveLength(1);
        expect(systemMessages[0].content).toContain('be brief');
        expect(systemMessages[0].content).toContain('ship the notes reader first');
        expect(messages[0].role).toBe('system');
        expect(messages[1].role).toBe('user');
    });
});

describe('prompt cache marks on Anthropic and OpenAI', () => {
    it('marks the joined Anthropic system block as an ephemeral cache breakpoint', async () => {
        localStorage.setItem('anthropicApiKey', 'test-key');
        const sentBody = stubAnthropicCall();

        const body = await sentBody('claude-sonnet-5', 'high', splitSystemHistory);

        expect(body.system).toEqual([
            {
                type: 'text',
                text: expect.stringContaining('be brief'),
                cache_control: { type: 'ephemeral' },
            },
        ]);
        expect((body.system as { text: string }[])[0].text).toContain('ship the notes reader first');
    });

    it('omits Anthropic system when history has no system message', async () => {
        localStorage.setItem('anthropicApiKey', 'test-key');
        const sentBody = stubAnthropicCall();

        const body = await sentBody('claude-sonnet-5', 'high');

        expect(body.system).toBeUndefined();
    });

    it('sends OpenAI a prompt_cache_key derived from the joined system text', async () => {
        localStorage.setItem('openaiApiKey', 'test-key');
        const sentBody = stubOpenAICall();

        const body = await sentBody(splitSystemHistory);

        expect(typeof body.prompt_cache_key).toBe('string');
        expect(body.prompt_cache_key).toMatch(/^switchat-notes-/);
    });

    it('omits OpenAI prompt_cache_key when there is no system text', async () => {
        localStorage.setItem('openaiApiKey', 'test-key');
        const sentBody = stubOpenAICall();

        const body = await sentBody(history);

        expect(body.prompt_cache_key).toBeUndefined();
    });
});
