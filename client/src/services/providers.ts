import type { Message } from "../types";
import { getModelConfig, type ModelConfig, type ThinkingApi } from "../config/models.config";

export interface ProviderResponse {
    text: string;
}

/**
 * Error de un proveedor con el contexto necesario para explicárselo al usuario.
 * El `name` no puede ser 'AbortError': `sendChatHistory` lo usa para distinguir
 * una cancelación voluntaria de un fallo real.
 */
export class ProviderError extends Error {
    status: number;
    provider: string;
    model: string;

    constructor(message: string, status: number, provider: string, model: string) {
        super(message);
        this.name = 'ProviderError';
        this.status = status;
        this.provider = provider;
        this.model = model;
    }
}

// Un cuerpo de error puede ser una página HTML entera; en el chat se renderiza como
// markdown, así que lo recortamos antes de que inunde la conversación.
const MAX_RAW_ERROR_LENGTH = 300;

/**
 * The words a user sees for a provider's error status. Shared by the HTTP path and by the
 * errors Google sends inside a stream that had already started, so both read the same.
 */
function friendlyProviderMessage(
    status: number,
    provider: string,
    modelLowerCase: string,
    detail: string
): string {
    const shortDetail = detail.length > MAX_RAW_ERROR_LENGTH
        ? `${detail.slice(0, MAX_RAW_ERROR_LENGTH)}…`
        : detail;

    // Textos heredados del errorMap del servidor: son los que ya veían los usuarios online
    const friendlyMessages: Record<number, string> = {
        401: `🔑 Invalid or expired API Key for ${provider}. Check your configuration.`,
        403: `🚫 Access denied by ${provider}. Your API Key does not have permissions to use the model "${modelLowerCase}".`,
        404: `❓ The model "${modelLowerCase}" does not exist or is unavailable in ${provider}.`,
        429: `⏳ Too many requests to ${provider}. You have reached the rate limit. Please wait a moment and try again.`,
        503: `🔥 The model "${modelLowerCase}" is experiencing high demand right now. Try again in a few seconds or try another model.`,
    };

    return friendlyMessages[status] || `Error ${status} from ${provider}: ${shortDetail}`;
}

/**
 * Traduce una respuesta HTTP fallida de un proveedor a un error accionable.
 *
 * Lee el cuerpo como texto ANTES de intentar parsearlo: un 502 de un proxy responde
 * HTML, y hacer `response.json()` directamente lanza un "Unexpected token '<'" que
 * tapa el fallo real. Mismo patrón que usaba `throwProviderError` en el servidor.
 */
async function throwProviderError(
    response: Response,
    provider: string,
    modelLowerCase: string
): Promise<never> {
    const rawBody = await response.text();

    let apiErrorMessage = rawBody;
    try {
        const parsed = JSON.parse(rawBody);
        apiErrorMessage = parsed.error?.message || parsed.message || rawBody;
    } catch {
        // El cuerpo no era JSON (HTML de un proxy, respuesta vacía): nos quedamos con el texto crudo
    }

    throw new ProviderError(
        friendlyProviderMessage(response.status, provider, modelLowerCase, apiErrorMessage),
        response.status,
        provider,
        modelLowerCase
    );
}

/**
 * Cuts a Server-Sent Events buffer into complete events and hands back the tail.
 *
 * A network read does not respect event boundaries: it can deliver one event and half of
 * the next one. Parsing whatever arrived would blow up on the half JSON and lose the rest
 * of the answer, so the caller keeps `rest` and prepends it to the next read.
 *
 * Exported only so it can be tested on its own; nothing outside this module uses it.
 */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
    // Normalised first: a server may separate events with \r\n\r\n, and splitting on \n\n
    // alone would leave a stray \r glued to every event.
    const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
    // The last piece is whatever came after the final separator: either empty, or the
    // beginning of an event still travelling.
    const rest = parts.pop() ?? '';
    return { events: parts, rest };
}

// Interfaces internas para Google Gemini
interface GeminiPart {
    text?: string;
    thought?: boolean;
}

interface GeminiGenerationConfig {
    thinkingConfig?: {
        thinkingLevel?: string;
    };
}

// Interfaz interna para OpenAI / compatible
interface ChatCompletionMessage {
    role: string;
    content: string;
}

interface ChatCompletionRequest {
    model: string;
    messages: ChatCompletionMessage[];
    reasoning_effort?: string;
    prompt_cache_key?: string;
}

export type ChunkListener = (textSoFar: string) => void;

/**
 * The visible text of one Gemini payload: the parts marked `thought` are the model's
 * reasoning and never belong in the bubble.
 *
 * No fallback here on purpose. The non-streaming path falls back to every part when the
 * filter leaves nothing, which is safe once, at the end. Doing that per chunk would print
 * the reasoning out loud, because a chunk carrying only thought parts is a normal thing to
 * receive.
 */
function geminiVisibleText(parts: GeminiPart[]): string {
    return parts
        .filter((part) => !part.thought && part.text)
        .map((part) => part.text)
        .join('');
}

/**
 * Reads the SSE body, reports the accumulated text as it grows, and returns the whole
 * answer so the caller keeps the same `{ text }` contract as the non-streaming path.
 *
 * JSON.parse is deliberately not wrapped in a try/catch: with splitSseEvents holding the
 * tail back, every payload that reaches it is complete, and swallowing an error here would
 * hide exactly the bug the buffer exists to prevent.
 *
 * The answer only counts once Google says it finished: its last event carries a
 * finishReason. Measured on 2026-09-27, an overloaded gemini-3.6-flash closed streams
 * mid-answer with no error and no finishReason, and six answers were saved as complete
 * while cut mid-sentence. The plain endpoint turned that cut into an error; so does this.
 */
async function readGeminiStream(
    response: Response,
    onChunk: ChunkListener,
    modelLowerCase: string
): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('The Google API did not return a readable response.');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let finished = false;

    const readEvent = (event: string) => {
        const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) return;

        const payload = dataLine.slice('data:'.length).trim();
        if (!payload) return;

        const parsed = JSON.parse(payload);
        // Google can give up after the answer has started. The status line already said
        // 200, so the overload arrives as an event: same words as when it says so up front.
        if (parsed.error) {
            const status = Number(parsed.error.code) || 500;
            throw new ProviderError(
                friendlyProviderMessage(status, 'google', modelLowerCase, parsed.error.message || ''),
                status,
                'google',
                modelLowerCase
            );
        }

        const candidate = parsed.candidates?.[0];
        // Any finishReason counts: STOP, MAX_TOKENS or SAFETY are Google ending the answer on
        // purpose. Only its absence means the stream was cut.
        if (candidate?.finishReason) finished = true;

        const parts: GeminiPart[] = candidate?.content?.parts ?? [];
        const visible = geminiVisibleText(parts);
        if (!visible) return;

        text += visible;
        onChunk(text);
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = splitSseEvents(buffer);
        buffer = rest;
        events.forEach(readEvent);
    }

    // The body can end without the blank line that closes its last event: what is left is
    // then a whole event. The final decode() only tells the decoder the body ended; a
    // well-formed body leaves nothing in it.
    buffer += decoder.decode();
    if (buffer.trim()) readEvent(buffer.replace(/\r\n/g, '\n'));

    if (!finished) {
        throw new ProviderError(
            '✂️ The answer from google was cut off before it finished. Try again in a few seconds or try another model.',
            502,
            'google',
            modelLowerCase
        );
    }

    return text;
}

/**
 * Cliente nativo para Google Gemini REST API.
 */
async function sendToGoogle(
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel: string,
    signal?: AbortSignal,
    onChunk?: ChunkListener
): Promise<ProviderResponse> {
    const apiKey = localStorage.getItem('geminiApiKey') || '';
    if (!apiKey) {
        throw new Error("⚠️ Open the **Account** panel and save your Google Gemini API key to start chatting.");
    }

    console.log(`🚀 [Providers] Native request to Google Gemini (${modelLowerCase})...`);

    // Separar mensajes de sistema si existen
    const systemMessages = messagesHistory.filter(msg => msg.role === 'system');
    const systemInstruction = systemMessages.length > 0 ? {
        parts: [{ text: systemMessages.map(msg => msg.parts?.[0]?.text || '').join('\n') }]
    } : undefined;

    // Formatear el historial de mensajes al formato nativo de Gemini (contents)
    const contents = messagesHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.parts?.[0]?.text || '' }]
        }));

    // Configurar opciones de generación y razonamiento (Thinking Config)
    const thinkingLevelMap: Record<string, string> = {
        'minimal': 'MINIMAL',
        'low': 'LOW',
        'medium': 'MEDIUM',
        'high': 'HIGH'
    };

    // Gemini 3.x no entiende 'off': lo mínimo que acepta es el nivel más bajo que
    // el modelo declare en MODEL_REGISTRY (las listas van de menor a mayor). La forma
    // antigua de apagarlo —thinkingConfig.thinkingBudget: 0— devuelve "Request contains
    // an invalid argument" en estos modelos, y es lo que impedía generar títulos, que es
    // el único sitio que pide 'off'.
    const lowestSupportedLevel = getModelConfig(modelLowerCase)?.thinkingLevels?.[0] || 'low';
    const effectiveLevel = reasoningLevel === 'off' ? lowestSupportedLevel : reasoningLevel;

    const generationConfig: GeminiGenerationConfig = {
        thinkingConfig: {
            thinkingLevel: thinkingLevelMap[effectiveLevel] || 'HIGH'
        }
    };

    const googleRequestBody = {
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
    };

    // Same body, same thinking config: the only thing streaming changes is the endpoint and
    // how the answer is read.
    const googleMethod = onChunk ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelLowerCase}:${googleMethod}key=${apiKey}`;

    const response = await fetch(googleApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleRequestBody),
        signal,
    });

    if (!response.ok) {
        await throwProviderError(response, 'google', modelLowerCase);
    }

    if (onChunk) {
        return { text: await readGeminiStream(response, onChunk, modelLowerCase) };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
        throw new Error('The Google API did not return a valid response.');
    }

    const parts: GeminiPart[] = candidate.content.parts;
    const textContent = geminiVisibleText(parts);

    return { text: textContent || parts.map((part: GeminiPart) => part.text || '').join('') };
}

// Anthropic's effort scale is low | medium | high | xhigh | max. Our slider also offers
// 'minimal', which has no equivalent there, so it lands on the lowest real level: sending
// 'minimal' as-is is rejected. An unknown level falls back to the API's own default.
const ANTHROPIC_EFFORT_BY_LEVEL: Record<string, string> = {
    minimal: 'low',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
};

function toAnthropicEffort(reasoningLevel: string): string {
    return ANTHROPIC_EFFORT_BY_LEVEL[reasoningLevel] || 'high';
}

/**
 * Writes the reasoning knob into the request body, in the shape that one model accepts.
 * There is no single shape: Anthropic replaced `thinking.budget_tokens` with
 * `output_config.effort`, and the newer models answer 400 to the old form while the older
 * ones do not understand the new one. MODEL_REGISTRY says which form each model uses.
 */
function applyAnthropicThinking(
    requestBody: Record<string, unknown>,
    thinkingApi: ThinkingApi,
    reasoningLevel: string,
    config?: ModelConfig
): void {
    if (thinkingApi === 'budget') {
        // Here turning reasoning off means leaving the field out: there is no 'disabled'.
        if (reasoningLevel === 'off') return;
        requestBody.thinking = {
            type: 'enabled',
            budget_tokens: config?.thinkingBudgets?.[reasoningLevel] || 4096,
        };
        return;
    }

    if (thinkingApi === 'always-on') {
        // This model cannot be silenced: any explicit `thinking` is a 400, 'disabled'
        // included. So 'off' becomes the cheapest effort it accepts, the same fallback
        // sendToGoogle makes for Gemini 3.x.
        const effort = reasoningLevel === 'off' ? 'low' : toAnthropicEffort(reasoningLevel);
        requestBody.output_config = { effort };
        return;
    }

    // 'effort': there IS a switch here, and it has to be used. Omitting `thinking` does not
    // turn it off on models that reason by default.
    if (reasoningLevel === 'off') {
        requestBody.thinking = { type: 'disabled' };
        return;
    }
    requestBody.thinking = { type: 'adaptive' };
    requestBody.output_config = { effort: toAnthropicEffort(reasoningLevel) };
}

/**
 * Cliente nativo para Anthropic Messages API (/v1/messages) con soporte para razonamiento.
 */
async function sendToAnthropic(
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel: string,
    signal?: AbortSignal
): Promise<ProviderResponse> {
    const apiKey = localStorage.getItem('anthropicApiKey') || '';
    if (!apiKey) {
        throw new Error("⚠️ Open the **Account** panel and save your Anthropic API key to start chatting.");
    }

    console.log(`🚀 [Providers] Native request to the Anthropic Messages API (${modelLowerCase})...`);

    const config = getModelConfig(modelLowerCase);

    // Extraer system prompt del historial de mensajes
    const systemMessages = messagesHistory.filter(msg => msg.role === 'system');
    const systemPrompt = systemMessages.map(msg => msg.parts?.[0]?.text || '').join('\n');

    // Convertir historial a mensajes nativos de Anthropic (roles: 'user' | 'assistant')
    const formattedMessages = messagesHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.parts?.[0]?.text || ''
        }));

    // Construir body de la petición
    const requestBody: Record<string, unknown> = {
        model: modelLowerCase,
        max_tokens: 16384,
        messages: formattedMessages
    };

    if (systemPrompt) {
        requestBody.system = [{
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
        }];
    }

    applyAnthropicThinking(requestBody, config?.thinkingApi ?? 'budget', reasoningLevel, config);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody),
        signal,
    });

    if (!response.ok) {
        await throwProviderError(response, 'anthropic', modelLowerCase);
    }

    const data = await response.json();
    if (!data.content || !Array.isArray(data.content)) {
        throw new Error('The Anthropic API did not return any valid content.');
    }

    // Filtrar únicamente los bloques de tipo 'text' (descartando bloques 'thinking')
    const textContent = data.content
        .filter((block: { type: string; text?: string }) => block.type === 'text' && block.text)
        .map((block: { text: string }) => block.text)
        .join('');

    return { text: textContent };
}

/**
 * Same notebook → same key; edit the notes → another key. OpenAI uses this to
 * route repeats of a long prefix onto the machine that already read it.
 */
function promptCacheKey(systemText: string): string {
    let hash = 5381;
    for (let i = 0; i < systemText.length; i++) {
        hash = ((hash << 5) + hash + systemText.charCodeAt(i)) | 0;
    }
    return `switchat-notes-${hash >>> 0}`;
}

function joinedSystemText(messagesHistory: Message[]): string {
    return messagesHistory
        .filter((msg) => msg.role === 'system')
        .map((msg) => msg.parts?.[0]?.text || '')
        .join('\n');
}

/**
 * Cliente estándar para OpenAI Chat Completions API.
 */
async function sendToOpenAI(
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel: string,
    signal?: AbortSignal
): Promise<ProviderResponse> {
    const apiKey = localStorage.getItem('openaiApiKey') || '';
    if (!apiKey) {
        throw new Error("⚠️ Open the **Account** panel and save your OpenAI API key to start chatting.");
    }

    console.log(`🚀 [Providers] Request to OpenAI (${modelLowerCase})...`);

    const systemText = joinedSystemText(messagesHistory);
    return sendToOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        apiKey,
        modelLowerCase,
        messagesHistory,
        reasoningLevel,
        signal,
        'openai',
        systemText ? { prompt_cache_key: promptCacheKey(systemText) } : undefined
    );
}

/**
 * Cliente genérico compatible con OpenAI (usado por OpenAI, LM Studio y Ollama).
 */
async function sendToOpenAICompatible(
    apiUrl: string,
    apiKey: string,
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel?: string,
    signal?: AbortSignal,
    providerName: string = 'openai',
    extraBody?: Pick<ChatCompletionRequest, 'prompt_cache_key'>
): Promise<ProviderResponse> {
    const systemText = joinedSystemText(messagesHistory);

    const formattedMessages: ChatCompletionMessage[] = [];
    if (systemText) {
        formattedMessages.push({ role: 'system', content: systemText });
    }
    for (const msg of messagesHistory) {
        if (msg.role === 'system') continue;
        formattedMessages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.parts?.[0]?.text || '',
        });
    }

    const requestBody: ChatCompletionRequest = {
        model: modelLowerCase,
        messages: formattedMessages,
        ...extraBody,
    };

    if (reasoningLevel && reasoningLevel !== 'off') {
        requestBody.reasoning_effort = reasoningLevel;
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal,
    });

    if (!response.ok) {
        await throwProviderError(response, providerName, modelLowerCase);
    }

    const data = await response.json();
    return { text: data.choices[0].message.content };
}

/**
 * Router principal que despacha la petición al proveedor de IA correspondiente.
 */
export async function fetchFromProvider(
    model: string,
    messagesHistory: Message[],
    reasoningLevel: string,
    signal?: AbortSignal,
    onChunk?: ChunkListener
): Promise<ProviderResponse> {
    const modelLowerCase = model.toLowerCase();
    const config = getModelConfig(model);
    const provider = (config?.provider || 'google').toLowerCase();

    switch (provider) {
        case 'google':
            return await sendToGoogle(modelLowerCase, messagesHistory, reasoningLevel, signal, onChunk);
        case 'anthropic':
            return await sendToAnthropic(modelLowerCase, messagesHistory, reasoningLevel, signal);
        case 'openai':
            return await sendToOpenAI(modelLowerCase, messagesHistory, reasoningLevel, signal);
        case 'lm studio':
            return await sendToOpenAICompatible(
                'http://127.0.0.1:1234/v1/chat/completions',
                'lm-studio-key',
                modelLowerCase,
                messagesHistory,
                undefined,
                signal,
                'lm studio'
            );
        case 'ollama':
            return await sendToOpenAICompatible(
                'http://127.0.0.1:11434/v1/chat/completions',
                'ollama-key',
                modelLowerCase,
                messagesHistory,
                undefined,
                signal,
                'ollama'
            );
        default:
            throw new Error(`⚠️ The AI provider "${provider}" is not supported.`);
    }
}
