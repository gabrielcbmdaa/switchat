import type { Chat, Message, GeminiModel } from "../types";

export const API_BACKEND_URL = '/api';

export async function saveChatToServer(updatedChat: Chat, token: string | null) {
    if (!token) return;

    try {
        const response = await fetch(`${API_BACKEND_URL}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updatedChat)
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [saveChatToServer]:', error);
        return false;
    }
}

export async function loadChatsFromServer(token: string) {
    if (!token) return null;

    try {
        const response = await fetch(`${API_BACKEND_URL}/chats`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Could not fetch chats');
        return await response.json(); // Retornamos los datos directamente
    } catch (error) {
        const err = error as Error
        console.error('⚠️ Error [loadChatsFromServer]:', err.message);
        return null;
    }
}

export async function fetchChatMessagesFromServer(chatId: string, token: string | null, limit: number = 6, before?: string) {
    if (!token) return null;

    try {
        let url = `${API_BACKEND_URL}/chats/${chatId}/messages?limit=${limit}`;
        if (before) {
            url += `&before=${encodeURIComponent(before)}`;
        }
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Could not fetch messages');
        return await response.json();
    } catch (error) {
        const err = error as Error
        console.error('⚠️ Error [fetchChatMessagesFromServer]:', err.message);
        return null;
    }
}

export async function deleteChatFromServer(chatId: string, token: string | null) {
    if (!token) return false;
    try {
        const response = await fetch(`${API_BACKEND_URL}/chats/${chatId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [deleteChatFromServer]:', error);
        return false;
    }
}

export async function deleteMessageFromServer(chatId: string, messageId: string, token: string | null) {
    if (!token) return false;
    try {
        const response = await fetch(`${API_BACKEND_URL}/chats/${chatId}/messages/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [deleteMessageFromServer]:', error);
        return false;
    }
}

export async function syncChatDraftToServer(chat: Chat, token: string | null) {
    if (!chat) return false;
    if (!token) return false;

    try {
        const response = await fetch(`${API_BACKEND_URL}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(chat),
            keepalive: true
        });
        return response.ok;
    } catch (error) {
        const err = error as Error
        console.error('❌ Cloud Sync Error:', err.message);
        return false;
    }
}

export async function fetchChatResponse(chatId: string, messagesHistory: Message[], model: string, token: string | null, provider: string): Promise<{ text: string, userMessageId?: string, aiMessageId?: string }> {
    const modelLowerCase = model.toLowerCase();
    const providerLowerCase = provider.toLowerCase();
    const reasoningLevel = localStorage.getItem('reasoningLevel') || 'off';
    // ==========================================
    // RUTA A: CON SERVIDOR (USUARIO AUTENTICADO)
    // ==========================================
    if (token) {
        const response = await fetch(`${API_BACKEND_URL}/chats/${chatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                content: messagesHistory[messagesHistory.length - 1].parts[0].text,
                messages: messagesHistory,
                model: modelLowerCase,
                provider: providerLowerCase
            })
        });

        if (response.status === 401) {
            throw new Error('SESSION_EXPIRED');
        }

        if (!response.ok) {
            // El backend ahora envía { message, error, code, provider, model }
            let errorMessage = 'Error en la respuesta del servidor proxy';
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch {
                // Si la respuesta no es JSON, usamos el mensaje genérico
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return { text: data.text, userMessageId: data.userMessageId, aiMessageId: data.aiMessageId };

        // ==========================================
        // RUTA B: MODO LOCAL (SIN SESIÓN)
        // ==========================================
    } else {
        let apiKey: string;
        let apiUrl: string;

        switch (providerLowerCase) {
            case 'openai':
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                apiKey = localStorage.getItem('openaiApiKey') || '';
                if (!apiKey) {
                    throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu OpenAI API Key para poder chatear.");
                }
                break;
            case 'google':
                apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
                apiKey = localStorage.getItem('geminiApiKey') || '';
                if (!apiKey) {
                    throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu Gemini API Key para poder chatear.");
                }
                break;
            case 'lm studio':
                apiUrl = 'http://127.0.0.1:1234/v1/chat/completions';
                apiKey = "lm-studio-key"; // Key dummy requerida por la especificación de OpenAI
                break;
            case 'ollama':
                apiUrl = 'http://127.0.0.1:11434/v1/chat/completions';
                apiKey = "ollama-key"; // Key dummy requerida por la especificación de OpenAI
                break;
            case 'anthropic':
                apiUrl = 'https://api.anthropic.com/v1/chat/completions';
                apiKey = localStorage.getItem('anthropicApiKey') || '';
                if (!apiKey) {
                    throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu Anthropic API Key para poder chatear.");
                }
                break;
            default:
                throw new Error(`⚠️ El proveedor de IA "${providerLowerCase}" no está soportado.`);
        }

        console.log(`🚀 Enviando petición a ${providerLowerCase}... con modelo: ${modelLowerCase}`);

        // Conversión unificada de mensajes al formato de OpenAI
        const formattedMessages = messagesHistory.map((msg) => {
            let role = 'user';
            if (msg.role === 'model') role = 'assistant';
            else if (msg.role === 'system') role = 'system';

            const contentText = msg.parts && msg.parts[0] ? msg.parts[0].text : '';
            return {
                role,
                content: contentText
            };
        });

        const requestBody: any = {
            model: modelLowerCase,
            messages: formattedMessages
        };

        if (providerLowerCase === 'google') {
            if (reasoningLevel !== 'off') {
                // OpenAI y su compatibilidad soporta "low", "medium", "high".
                // Mapeamos 'minimal' a 'low' para cumplir con la especificación de la API.
                const effort = reasoningLevel === 'minimal' ? 'low' : reasoningLevel;
                requestBody.reasoning_effort = effort;
            }
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
            throw new Error(errorData.error?.message || 'Error en la API de Google');
        }

        const data = await response.json();
        return { text: data.choices[0].message.content };
    }
}

export async function loginOrRegister(email: string, password: string, isSignUp: boolean) {
    const AUTH_URL = isSignUp
        ? `${API_BACKEND_URL}/auth/register`
        : `${API_BACKEND_URL}/auth/login`;

    const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Auth process failed');
    }

    return await response.json(); // Retorna el token o el mensaje de éxito
}


// 2. Cliente de Modelos de Google
export async function getLiveModels(apiKey: string): Promise<{ value: string; label: string; thinking?: boolean }[]> {
    const modelsAskUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(modelsAskUrl);

    if (!response.ok) throw new Error('No se pudieron obtener los modelos');

    // 2. Le aseguramos a TypeScript que la respuesta tiene un array de 'GeminiModel'
    const data = await response.json() as { models: GeminiModel[] };

    // Ahora 'm' hereda automáticamente el tipo GeminiModel y autocompleta sus propiedades
    return data.models
        .filter(m => m.supportedGenerationMethods.includes('generateContent'))
        .map(m => ({
            value: m.name.replace('models/', ''),
            label: m.displayName || m.name.replace('models/', ''),
            thinking: m.thinking
        }));
}