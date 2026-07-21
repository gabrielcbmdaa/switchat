import type { Message } from "../types";
import { getModelConfig } from "../config/models.config";

export interface ProviderResponse {
    text: string;
}

// Interfaces internas para Google Gemini
interface GeminiPart {
    text?: string;
    thought?: boolean;
}

interface GeminiGenerationConfig {
    thinkingConfig?: {
        thinkingLevel?: string;
        thinkingBudget?: number;
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
    reasoningLevel: string
): Promise<ProviderResponse> {
    const apiKey = localStorage.getItem('geminiApiKey') || '';
    if (!apiKey) {
        throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu Gemini API Key para poder chatear.");
    }

    console.log(`🚀 [Providers] Petición nativa a Google Gemini (${modelLowerCase})...`);

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
    const generationConfig: GeminiGenerationConfig = {};
    if (reasoningLevel !== 'off') {
        const thinkingLevelMap: Record<string, string> = {
            'minimal': 'MINIMAL',
            'low': 'LOW',
            'medium': 'MEDIUM',
            'high': 'HIGH'
        };
        generationConfig.thinkingConfig = {
            thinkingLevel: thinkingLevelMap[reasoningLevel] || 'HIGH'
        };
    } else {
        generationConfig.thinkingConfig = {
            thinkingBudget: 0
        };
    }

    const googleRequestBody = {
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
    };

    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelLowerCase}:generateContent?key=${apiKey}`;

    const response = await fetch(googleApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleRequestBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Error en la API de Google');
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
        throw new Error('La API de Google no devolvió ninguna respuesta válida.');
    }

    const parts: GeminiPart[] = candidate.content.parts;
    // Filtrar trazas de pensamiento ('thought: true') y devolver texto final
    const textContent = parts
        .filter((part: GeminiPart) => !part.thought && part.text)
        .map((part: GeminiPart) => part.text)
        .join('');

    return { text: textContent || parts.map((part: GeminiPart) => part.text || '').join('') };
}

/**
 * Cliente nativo para Anthropic Messages API (/v1/messages) con soporte para Extended Thinking.
 */
async function sendToAnthropic(
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel: string
): Promise<ProviderResponse> {
    const apiKey = localStorage.getItem('anthropicApiKey') || '';
    if (!apiKey) {
        throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu Anthropic API Key para poder chatear.");
    }

    console.log(`🚀 [Providers] Petición nativa a Anthropic Messages API (${modelLowerCase})...`);

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

    // Configurar Extended Thinking si está habilitado
    if (reasoningLevel !== 'off') {
        const budget = config?.thinkingBudgets?.[reasoningLevel] || 4096;
        requestBody.thinking = {
            type: 'enabled',
            budget_tokens: budget
        };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Error en la API de Anthropic');
    }

    const data = await response.json();
    if (!data.content || !Array.isArray(data.content)) {
        throw new Error('La API de Anthropic no devolvió ningún contenido válido.');
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
    reasoningLevel: string
): Promise<ProviderResponse> {
    const apiKey = localStorage.getItem('openaiApiKey') || '';
    if (!apiKey) {
        throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu OpenAI API Key para poder chatear.");
    }

    console.log(`🚀 [Providers] Petición a OpenAI (${modelLowerCase})...`);

    return sendToOpenAICompatible('https://api.openai.com/v1/chat/completions', apiKey, modelLowerCase, messagesHistory, reasoningLevel);
}

/**
 * Cliente genérico compatible con OpenAI (usado por OpenAI, LM Studio y Ollama).
 */
async function sendToOpenAICompatible(
    apiUrl: string,
    apiKey: string,
    modelLowerCase: string,
    messagesHistory: Message[],
    reasoningLevel?: string
): Promise<ProviderResponse> {
    const formattedMessages: ChatCompletionMessage[] = messagesHistory.map((msg) => {
        let role = 'user';
        if (msg.role === 'model') role = 'assistant';
        else if (msg.role === 'system') role = 'system';

        const contentText = msg.parts && msg.parts[0] ? msg.parts[0].text : '';
        return { role, content: contentText };
    });

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
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Error en la API del proveedor');
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
    reasoningLevel: string
): Promise<ProviderResponse> {
    const modelLowerCase = model.toLowerCase();
    const config = getModelConfig(model);
    const provider = (config?.provider || 'google').toLowerCase();

    switch (provider) {
        case 'google':
            return await sendToGoogle(modelLowerCase, messagesHistory, reasoningLevel);
        case 'anthropic':
            return await sendToAnthropic(modelLowerCase, messagesHistory, reasoningLevel);
        case 'openai':
            return await sendToOpenAI(modelLowerCase, messagesHistory, reasoningLevel);
        case 'lm studio':
            return await sendToOpenAICompatible(
                'http://127.0.0.1:1234/v1/chat/completions',
                'lm-studio-key',
                modelLowerCase,
                messagesHistory
            );
        case 'ollama':
            return await sendToOpenAICompatible(
                'http://127.0.0.1:11434/v1/chat/completions',
                'ollama-key',
                modelLowerCase,
                messagesHistory
            );
        default:
            throw new Error(`⚠️ El proveedor de IA "${provider}" no está soportado.`);
    }
}
