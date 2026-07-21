/**
 * Servicio modular para comunicación con APIs externas de proveedores de IA.
 * Soporta Google Gemini, Anthropic Claude (/v1/messages), OpenAI, LM Studio y Ollama.
 */

/**
 * Cliente nativo para Google Gemini REST API.
 */
async function sendToGoogle(modelLowerCase, messagesHistory, reasoningLevel) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error("⚠️ API Key de Google no fue encontrada.");
    }

    const systemMessages = messagesHistory.filter(msg => msg.role === 'system');
    const systemInstruction = systemMessages.length > 0 ? {
        parts: [{ text: systemMessages.map(msg => msg.parts?.[0]?.text || '').join('\n') }]
    } : undefined;

    const contents = messagesHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.parts?.[0]?.text || '' }]
        }));

    const generationConfig = {};
    if (reasoningLevel && reasoningLevel !== 'off') {
        const thinkingLevelMap = {
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
        await throwProviderError(response, 'google', modelLowerCase);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
        throw new Error('La API de Google Gemini no devolvió ninguna respuesta válida.');
    }

    const parts = candidate.content.parts;
    const responseText = parts
        .filter(part => !part.thought && part.text)
        .map(part => part.text)
        .join('') || parts.map(part => part.text || '').join('');

    return { text: responseText };
}

/**
 * Cliente nativo para Anthropic Messages API (/v1/messages) con soporte para Extended Thinking.
 */
async function sendToAnthropic(modelLowerCase, messagesHistory, reasoningLevel, thinkingBudget = 4096) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("⚠️ API Key de Anthropic no fue encontrada.");
    }

    const systemMessages = messagesHistory.filter(msg => msg.role === 'system');
    const systemPrompt = systemMessages.map(msg => msg.parts?.[0]?.text || '').join('\n');

    const formattedMessages = messagesHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.parts?.[0]?.text || ''
        }));

    const requestBody = {
        model: modelLowerCase,
        max_tokens: 16384,
        messages: formattedMessages
    };

    if (systemPrompt) {
        requestBody.system = systemPrompt;
    }

    if (reasoningLevel && reasoningLevel !== 'off') {
        requestBody.thinking = {
            type: 'enabled',
            budget_tokens: thinkingBudget
        };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        await throwProviderError(response, 'anthropic', modelLowerCase);
    }

    const data = await response.json();
    if (!data.content || !Array.isArray(data.content)) {
        throw new Error('La API de Anthropic no devolvió ningún contenido válido.');
    }

    const textContent = data.content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text)
        .join('');

    return { text: textContent };
}

/**
 * Cliente para OpenAI Chat Completions API.
 */
async function sendToOpenAI(modelLowerCase, messagesHistory, reasoningLevel) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("⚠️ API Key de OpenAI no fue encontrada.");
    }

    return sendToOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        apiKey,
        modelLowerCase,
        messagesHistory,
        reasoningLevel,
        'openai'
    );
}

/**
 * Cliente genérico compatible con el formato OpenAI Chat Completions (usado por OpenAI, LM Studio y Ollama).
 */
async function sendToOpenAICompatible(apiUrl, apiKey, modelLowerCase, messagesHistory, reasoningLevel, providerName = 'openai') {
    const formattedMessages = messagesHistory.map(msg => {
        let role = 'user';
        if (msg.role === 'model') role = 'assistant';
        else if (msg.role === 'system') role = 'system';

        const contentText = msg.parts && msg.parts[0] ? msg.parts[0].text : '';
        return { role, content: contentText };
    });

    const requestBody = {
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
        await throwProviderError(response, providerName, modelLowerCase);
    }

    const data = await response.json();
    return { text: data.choices[0].message.content };
}

/**
 * Helper unificado para extraer y relanzar errores formateados de proveedores HTTP.
 */
async function throwProviderError(response, providerLowerCase, modelLowerCase) {
    const errorText = await response.text();
    let apiErrorMessage = errorText;
    try {
        const errorJson = JSON.parse(errorText);
        apiErrorMessage = errorJson.error?.message || errorJson.message || errorText;
    } catch {}

    const statusCode = response.status;
    const error = new Error(`Provider API Error ${statusCode}`);
    error.status = statusCode >= 500 ? 502 : statusCode;
    error.provider = providerLowerCase;
    error.model = modelLowerCase;
    error.apiErrorMessage = apiErrorMessage;
    throw error;
}

/**
 * Router principal de proveedores para el backend.
 */
async function fetchFromProvider({ model, provider, messagesHistory, reasoningLevel, thinkingBudget }) {
    const modelLowerCase = model ? model.toLowerCase() : '';
    const providerLowerCase = (provider || 'google').toLowerCase();

    switch (providerLowerCase) {
        case 'google':
            return await sendToGoogle(modelLowerCase, messagesHistory, reasoningLevel);
        case 'anthropic':
            return await sendToAnthropic(modelLowerCase, messagesHistory, reasoningLevel, thinkingBudget);
        case 'openai':
            return await sendToOpenAI(modelLowerCase, messagesHistory, reasoningLevel);
        case 'lm studio':
            return await sendToOpenAICompatible(
                'http://127.0.0.1:1234/v1/chat/completions',
                'lm-studio-key',
                modelLowerCase,
                messagesHistory,
                reasoningLevel,
                'lm studio'
            );
        case 'ollama':
            return await sendToOpenAICompatible(
                'http://127.0.0.1:11434/v1/chat/completions',
                'ollama-key',
                modelLowerCase,
                messagesHistory,
                reasoningLevel,
                'ollama'
            );
        default:
            throw new Error(`⚠️ El proveedor de IA "${providerLowerCase}" no está soportado.`);
    }
}

module.exports = {
    fetchFromProvider
};
