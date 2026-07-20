import type { Chat, Message, GeminiModel, ChatCompletionRequest } from "../types";
import { getModelConfig } from "../config/models.config";

export const API_BACKEND_URL = '/api';

export async function saveChatToServer(updatedChat: Chat) {
    try {
        const response = await fetch(`${API_BACKEND_URL}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // 👈 Para enviar la cookie de sesión
            body: JSON.stringify(updatedChat)
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [saveChatToServer]:', error);
        return false;
    }
}

export async function loadChatsFromServer() {
    try {
        const response = await fetch(`${API_BACKEND_URL}/chats`, {
            method: 'GET',
            credentials: 'include' // 👈 Para enviar la cookie de sesión
        });
        if (!response.ok) throw new Error('Could not fetch chats');
        return await response.json(); // Retornamos los datos directamente
    } catch (error) {
        const err = error as Error
        console.error('⚠️ Error [loadChatsFromServer]:', err.message);
        return null;
    }
}

export async function fetchChatMessagesFromServer(chatId: string, limit: number = 6, before?: string) {
    try {
        let url = `${API_BACKEND_URL}/chats/${chatId}/messages?limit=${limit}`;
        if (before) {
            url += `&before=${encodeURIComponent(before)}`;
        }
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include' // 👈 Para enviar la cookie de sesión
        });
        if (!response.ok) throw new Error('Could not fetch messages');
        return await response.json();
    } catch (error) {
        const err = error as Error
        console.error('⚠️ Error [fetchChatMessagesFromServer]:', err.message);
        return null;
    }
}

export async function deleteChatFromServer(chatId: string) {
    try {
        const response = await fetch(`${API_BACKEND_URL}/chats/${chatId}`, {
            method: 'DELETE',
            credentials: 'include' // 👈 Para enviar la cookie de sesión
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [deleteChatFromServer]:', error);
        return false;
    }
}

export async function deleteMessageFromServer(chatId: string, messageId: string) {
    try {
        const response = await fetch(`${API_BACKEND_URL}/chats/${chatId}/messages/${messageId}`, {
            method: 'DELETE',
            credentials: 'include' // 👈 Para enviar la cookie de sesión
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [deleteMessageFromServer]:', error);
        return false;
    }
}

export async function syncChatDraftToServer(chat: Chat) {
    if (!chat) return false;

    try {
        const response = await fetch(`${API_BACKEND_URL}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // 👈 Para enviar la cookie de sesión
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

export async function fetchChatResponse(chatId: string, messagesHistory: Message[], model: string, useServer: boolean): Promise<{ text: string, userMessageId?: string, aiMessageId?: string }> {
    const modelLowerCase = model.toLowerCase();
    const config = getModelConfig(model);
    const provider = config?.provider || 'google';
    const providerLowerCase = provider.toLowerCase();
    const reasoningLevel = localStorage.getItem('reasoningLevel') || 'off';
    // ==========================================
    // RUTA A: CON SERVIDOR (USUARIO AUTENTICADO)
    // ==========================================
    if (useServer) {
        const response = await fetch(`${API_BACKEND_URL}/chats/${chatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // 👈 Para enviar la cookie de sesión
            body: JSON.stringify({
                content: messagesHistory[messagesHistory.length - 1].parts[0].text,
                messages: messagesHistory,
                model: modelLowerCase,
                provider: providerLowerCase,
                reasoningLevel
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

    } else {
        // ==========================================
        // RUTA B: MODO LOCAL (SIN SESIÓN)
        // ==========================================
        // ------------------------------------------
        // PROVEEDOR GOOGLE GEMINI (API REST NATIVA)
        // ------------------------------------------
        if (providerLowerCase === 'google') {
            const apiKey = localStorage.getItem('geminiApiKey') || '';
            if (!apiKey) {
                throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu Gemini API Key para poder chatear.");
            }

            console.log(`🚀 Enviando petición nativa a Google Gemini... con modelo: ${modelLowerCase}`);

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
                headers: {
                    'Content-Type': 'application/json'
                },
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
            // Filtrar y devolver únicamente la respuesta final (excluyendo trazas de razonamiento 'thought: true')
            const textContent = parts
                .filter((part: GeminiPart) => !part.thought && part.text)
                .map((part: GeminiPart) => part.text)
                .join('');

            return { text: textContent || parts.map((part: GeminiPart) => part.text || '').join('') };
        }

        // ------------------------------------------
        // OTROS PROVEEDORES (OPENAI, ANTHROPIC, LM STUDIO, OLLAMA)
        // ------------------------------------------
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
            case 'anthropic':
                apiUrl = 'https://api.anthropic.com/v1/chat/completions';
                apiKey = localStorage.getItem('anthropicApiKey') || '';
                if (!apiKey) {
                    throw new Error("⚠️ Por favor, ve al menú **Config** y guarda tu Anthropic API Key para poder chatear.");
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

        const requestBody: ChatCompletionRequest = {
            model: modelLowerCase,
            messages: formattedMessages
        };

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
            throw new Error(errorData.error?.message || 'Error en la API');
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
        credentials: 'include', // 👈 Obliga al navegador a aceptar y guardar las cookies del servidor
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Auth process failed');
    }

    return await response.json(); // Retorna el token o el mensaje de éxito
}

export async function logoutFromServer() {
    try {
        const response = await fetch(`${API_BACKEND_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include' // 👈 Para asegurar que limpie la cookie correspondiente
        });
        return response.ok;
    } catch (error) {
        console.error('❌ Error [logoutFromServer]:', error);
        return false;
    }
}

export async function checkSession(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BACKEND_URL}/auth/me`, {
            method: 'GET',
            credentials: 'include' // 👈 Envía la cookie para verificarla
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.authenticated === true;
    } catch (error) {
        console.error('❌ Error [checkSession]:', error);
        return false;
    }
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