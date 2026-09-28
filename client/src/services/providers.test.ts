import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchChatResponse } from './api';
import { fetchFromProvider, splitSseEvents } from './providers';
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
        for (const model of ['claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-5', 'claude-fable-5', 'claude-fable-5-1', 'claude-opus-5-5']) {
            const body = await sentBody(model, 'high');

            expect(JSON.stringify(body)).not.toContain('budget_tokens');
        }
    });

    it("translates our 'minimal' to 'low': the effort scale starts there", async () => {
        const body = await sentBody('claude-sonnet-5', 'minimal');

        expect(body.output_config).toEqual({ effort: 'low' });
    });

    it("turns thinking off with type 'disabled', not by omitting the field", async () => {
        for (const model of ['claude-opus-4-8', 'claude-opus-5']) {
            const body = await sentBody(model, 'off');

            expect(body.thinking).toEqual({ type: 'disabled' });
            expect(body.output_config).toBeUndefined();
        }
    });

    it('omits thinking entirely on a model whose thinking cannot be turned off', async () => {
        for (const model of ['claude-fable-5', 'claude-fable-5-1', 'claude-opus-5-5']) {
            const body = await sentBody(model, 'high');

            expect(body.thinking).toBeUndefined();
            expect(body.output_config).toEqual({ effort: 'high' });
        }
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

describe('Gemini 3.8 and 3.7 thinking level', () => {
    it("sends LOW when the slider is off, because 'minimal' is rejected on these models", async () => {
        localStorage.setItem('geminiApiKey', 'test-key');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: 'hi' }] } }],
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        for (const model of ['gemini-3.8-flash', 'gemini-3.7-flash']) {
            await fetchFromProvider(model, history, 'off');
            const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
            const body = JSON.parse(init.body) as {
                generationConfig: { thinkingConfig: { thinkingLevel: string } };
            };

            expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('LOW');
        }
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

/**
 * Stubs fetch with a streaming Gemini answer. `reads` are the byte slices the network
 * hands over, on purpose not aligned with the events: that misalignment is the bug the
 * buffer exists for.
 */
function stubGoogleStream(reads: string[]) {
    const encoder = new TextEncoder();
    let index = 0;

    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: {
            getReader: () => ({
                read: async () =>
                    index < reads.length
                        ? { done: false, value: encoder.encode(reads[index++]) }
                        : { done: true, value: undefined },
            }),
        },
    });
    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

function sseEvent(payload: unknown): string {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

function geminiChunk(parts: { text?: string; thought?: boolean }[], finishReason?: string) {
    return { candidates: [{ content: { parts }, ...(finishReason ? { finishReason } : {}) }] };
}

describe('sendToGoogle — streaming', () => {
    beforeEach(() => {
        localStorage.setItem('geminiApiKey', 'test-key');
    });

    it('uses the plain endpoint when nobody asks for chunks', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ candidates: [{ content: { parts: [{ text: 'un titulo' }] } }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await fetchFromProvider('gemini-3.5-flash', history, 'off');

        const [url] = fetchMock.mock.calls[0];
        expect(url).toContain(':generateContent');
        expect(url).not.toContain('streamGenerateContent');
    });

    it('uses the streaming endpoint when a chunk callback is given', async () => {
        const fetchMock = stubGoogleStream([sseEvent(geminiChunk([{ text: 'hola' }], 'STOP'))]);

        await fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {});

        const [url] = fetchMock.mock.calls[0];
        expect(url).toContain(':streamGenerateContent');
        expect(url).toContain('alt=sse');
    });

    it('reports the accumulated text, not the loose chunk, and returns the whole answer', async () => {
        stubGoogleStream([
            sseEvent(geminiChunk([{ text: 'Hola' }])),
            sseEvent(geminiChunk([{ text: ' qué' }])),
            sseEvent(geminiChunk([{ text: ' tal' }], 'STOP')),
        ]);

        const seen: string[] = [];
        const { text } = await fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, (soFar) => {
            seen.push(soFar);
        });

        expect(seen).toEqual(['Hola', 'Hola qué', 'Hola qué tal']);
        expect(text).toBe('Hola qué tal');
    });

    it('never reports the reasoning parts while streaming', async () => {
        stubGoogleStream([
            sseEvent(geminiChunk([{ text: 'estoy pensando', thought: true }])),
            sseEvent(geminiChunk([{ text: 'la respuesta' }], 'STOP')),
        ]);

        const seen: string[] = [];
        const { text } = await fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, (soFar) => {
            seen.push(soFar);
        });

        expect(seen).toEqual(['la respuesta']);
        expect(text).toBe('la respuesta');
    });

    it('rebuilds an event split across two reads', async () => {
        const whole = sseEvent(geminiChunk([{ text: 'entera' }], 'STOP'));
        stubGoogleStream([whole.slice(0, 12), whole.slice(12)]);

        const { text } = await fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {});

        expect(text).toBe('entera');
    });

    // Measured on 2026-09-27: an overloaded gemini-3.6-flash closed the stream mid-answer,
    // with no error and no finishReason, and the cut text was saved as a finished answer.
    it('fails instead of answering when the stream ends before Google says it finished', async () => {
        stubGoogleStream([sseEvent(geminiChunk([{ text: 'La medición del tiempo dio un giro' }]))]);

        const seen: string[] = [];
        await expect(
            fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, (soFar) => {
                seen.push(soFar);
            })
        ).rejects.toThrow(/cut off before it finished/);
        // The text had already been shown: failing is what keeps it from being saved.
        expect(seen).toEqual(['La medición del tiempo dio un giro']);
    });

    it('turns an error that arrives inside the stream into the friendly message', async () => {
        stubGoogleStream([
            sseEvent(geminiChunk([{ text: 'Hola' }])),
            sseEvent({ error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } }),
        ]);

        await expect(
            fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {})
        ).rejects.toThrow(/is experiencing high demand right now/);
    });

    it('reads a last event that is not followed by a blank line', async () => {
        stubGoogleStream([
            sseEvent(geminiChunk([{ text: 'casi ' }])),
            `data: ${JSON.stringify(geminiChunk([{ text: 'entera' }], 'STOP'))}`,
        ]);

        const { text } = await fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {});

        expect(text).toBe('casi entera');
    });

    // The shape captured from the real API on 2026-09-27: the finishing event carries
    // finishReason and usage data, and no text at all.
    it('accepts a finishing event that carries no text', async () => {
        stubGoogleStream([
            sseEvent(geminiChunk([{ text: 'respuesta' }])),
            sseEvent(geminiChunk([], 'STOP')),
        ]);

        const { text } = await fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {});

        expect(text).toBe('respuesta');
    });

    // Stop reaches the reader as an aborted read. It must leave as AbortError, which
    // sendChatHistory keeps as a stopped answer; never as the "cut off" error, which would
    // throw the text away.
    it('lets a Stop mid-stream through as an AbortError, not as a cut', async () => {
        const encoder = new TextEncoder();
        let reads = 0;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            body: {
                getReader: () => ({
                    read: async () => {
                        reads += 1;
                        if (reads === 1) {
                            return { done: false, value: encoder.encode(sseEvent(geminiChunk([{ text: 'a medias' }]))) };
                        }
                        const abort = new Error('The user aborted a request.');
                        abort.name = 'AbortError';
                        throw abort;
                    },
                }),
            },
        }));

        await expect(
            fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {})
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('still gives the friendly message when the request fails before any chunk', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => '{"error":{"message":"bad key"}}',
        }));

        await expect(
            fetchFromProvider('gemini-3.5-flash', history, 'low', undefined, () => {})
        ).rejects.toThrow(/Invalid or expired API Key/);
    });
});

describe('fetchChatResponse — onChunk reaches fetchFromProvider', () => {
    beforeEach(() => {
        localStorage.setItem('geminiApiKey', 'test-key');
    });

    it('uses the streaming endpoint when the caller passes onChunk', async () => {
        const reads = [sseEvent(geminiChunk([{ text: 'hola' }], 'STOP'))];
        const encoder = new TextEncoder();
        let index = 0;

        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(':streamGenerateContent')) {
                return Promise.resolve({
                    ok: true,
                    body: {
                        getReader: () => ({
                            read: async () =>
                                index < reads.length
                                    ? { done: false, value: encoder.encode(reads[index++]) }
                                    : { done: true, value: undefined },
                        }),
                    },
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    candidates: [{ content: { parts: [{ text: 'hola' }] } }],
                }),
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        await fetchChatResponse(
            history,
            'gemini-3.5-flash',
            'low',
            undefined,
            undefined,
            undefined,
            undefined,
            () => {}
        );

        const [url] = fetchMock.mock.calls[0];
        expect(url).toContain(':streamGenerateContent');
    });
});

describe('splitSseEvents — the buffer that survives a split read', () => {
    it('returns the complete events and keeps the tail', () => {
        const { events, rest } = splitSseEvents('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"');

        expect(events).toEqual(['data: {"a":1}', 'data: {"b":2}']);
        expect(rest).toBe('data: {"c"');
    });

    it('reconstructs an event that arrived cut in half', () => {
        const first = splitSseEvents('data: {"text":"hol');
        expect(first.events).toEqual([]);

        const second = splitSseEvents(`${first.rest}a"}\n\n`);
        expect(second.events).toEqual(['data: {"text":"hola"}']);
        expect(second.rest).toBe('');
    });

    it('treats CRLF separators like LF ones', () => {
        const { events, rest } = splitSseEvents('data: {"a":1}\r\n\r\ndata: {"b":2}\r\n\r\n');

        expect(events).toEqual(['data: {"a":1}', 'data: {"b":2}']);
        expect(rest).toBe('');
    });
});
