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

    if (apiErrorMessage.length > MAX_RAW_ERROR_LENGTH) {
        apiErrorMessage = `${apiErrorMessage.slice(0, MAX_RAW_ERROR_LENGTH)}…`;
    }

    // Textos heredados del errorMap del servidor: son los que ya veían los usuarios online
    const friendlyMessages: Record<number, string> = {
        401: `🔑 Invalid or expired API Key for ${provider}. Check your configuration.`,
        403: `🚫 Access denied by ${provider}. Your API Key does not have permissions to use the model "${modelLowerCase}".`,
        404: `❓ The model "${modelLowerCase}" does not exist or is unavailable in ${provider}.`,
        429: `⏳ Too many requests to ${provider}. You have reached the rate limit. Please wait a moment and try again.`,
        503: `🔥 The model "${modelLowerCase}" is experiencing high demand right now. Try again in a few seconds or try another model.`,
    };

    const message = friendlyMessages[response.status]
        || `Error ${response.status} from ${provider}: ${apiErrorMessage}`;

    throw new ProviderError(message, response.status, provider, modelLowerCase);
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
}

/**
 * Cliente nativo para Google Gemini REST API.
 */
async function sendToGoogle(
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel: string,
    signal?: AbortSignal
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

    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelLowerCase}:generateContent?key=${apiKey}`;

    const response = await fetch(googleApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleRequestBody),
        signal,
    });

    if (!response.ok) {
        await throwProviderError(response, 'google', modelLowerCase);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
        throw new Error('The Google API did not return a valid response.');
    }

    const parts: GeminiPart[] = candidate.content.parts;
    // Filtrar trazas de pensamiento ('thought: true') y devolver texto final
    const textContent = parts
        .filter((part: GeminiPart) => !part.thought && part.text)
        .map((part: GeminiPart) => part.text)
        .join('');

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
        requestBody.system = systemPrompt;
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

    return sendToOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        apiKey,
        modelLowerCase,
        messagesHistory,
        reasoningLevel,
        signal
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
    providerName: string = 'openai'
): Promise<ProviderResponse> {
    const systemText = messagesHistory
        .filter((msg) => msg.role === 'system')
        .map((msg) => msg.parts?.[0]?.text || '')
        .join('\n');

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
        messages: formattedMessages
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
    signal?: AbortSignal
): Promise<ProviderResponse> {
    const modelLowerCase = model.toLowerCase();
    const config = getModelConfig(model);
    const provider = (config?.provider || 'google').toLowerCase();

    switch (provider) {
        case 'google':
            return await sendToGoogle(modelLowerCase, messagesHistory, reasoningLevel, signal);
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
