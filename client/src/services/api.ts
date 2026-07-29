import type { Chat, Message } from "../types";
import { getModelConfig } from "../config/models.config";
import { fetchFromProvider, getApiKeyForProvider } from "./providers";

export const API_BACKEND_URL = '/api';

/**
 * Helper base para peticiones HTTP con cookies de sesión e inclusión automática de JSON headers.
 */
async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BACKEND_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
}

// ============================================================================
// Autenticación & Sesión de Usuario
// ============================================================================

export async function checkSession(): Promise<{ authenticated: boolean; userId?: string }> {
  try {
    const response = await apiFetch('/auth/me');
    if (!response.ok) return { authenticated: false };
    const data = await response.json();
    return {
      authenticated: Boolean(data.authenticated),
      userId: data.userId ? String(data.userId) : undefined,
    };
  } catch (error) {
    console.error('❌ Error [checkSession]:', error);
    return { authenticated: false };
  }
}

export async function loginOrRegister(email: string, password: string, isSignUp: boolean) {
  const endpoint = isSignUp ? '/auth/register' : '/auth/login';
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Auth process failed');
  }

  return await response.json();
}

export async function logoutFromServer(): Promise<boolean> {
  try {
    const response = await apiFetch('/auth/logout', { method: 'POST' });
    return response.ok;
  } catch (error) {
    console.error('❌ Error [logoutFromServer]:', error);
    return false;
  }
}

// ============================================================================
// Persistencia de Chats y Mensajes en Servidor
// ============================================================================

export async function loadChatsFromServer() {
  try {
    const response = await apiFetch('/chats');
    if (!response.ok) throw new Error('Could not fetch chats');
    return await response.json();
  } catch (error) {
    const err = error as Error;
    console.error('⚠️ Error [loadChatsFromServer]:', err.message);
    return null;
  }
}

export async function fetchChatMessagesFromServer(chatId: string, limit: number = 6, before?: string) {
  try {
    let endpoint = `/chats/${chatId}/messages?limit=${limit}`;
    if (before) {
      endpoint += `&before=${encodeURIComponent(before)}`;
    }
    const response = await apiFetch(endpoint);
    if (!response.ok) throw new Error('Could not fetch messages');
    return await response.json();
  } catch (error) {
    const err = error as Error;
    console.error('⚠️ Error [fetchChatMessagesFromServer]:', err.message);
    return null;
  }
}

export async function saveChatToServer(updatedChat: Chat): Promise<boolean> {
  try {
    const response = await apiFetch('/chats', {
      method: 'POST',
      body: JSON.stringify(updatedChat),
    });
    return response.ok;
  } catch (error) {
    console.error('❌ Error [saveChatToServer]:', error);
    return false;
  }
}

export async function syncChatDraftToServer(chat: Chat): Promise<boolean> {
  if (!chat) return false;

  try {
    const response = await apiFetch('/chats', {
      method: 'POST',
      body: JSON.stringify(chat),
      keepalive: true,
    });
    return response.ok;
  } catch (error) {
    const err = error as Error;
    console.error('❌ Cloud Sync Error [syncChatDraftToServer]:', err.message);
    return false;
  }
}

export async function deleteChatFromServer(chatId: string): Promise<boolean> {
  try {
    const response = await apiFetch(`/chats/${chatId}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('❌ Error [deleteChatFromServer]:', error);
    return false;
  }
}

export async function deleteMessageFromServer(chatId: string, messageId: string): Promise<boolean> {
  try {
    const response = await apiFetch(`/chats/${chatId}/messages/${messageId}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('❌ Error [deleteMessageFromServer]:', error);
    return false;
  }
}

// ============================================================================
// Servicios de IA / Completado de Mensajes
// ============================================================================

export async function fetchChatResponse(
  chatId: string,
  messagesHistory: Message[],
  model: string,
  useServer: boolean,
  systemPrompt?: string,
  signal?: AbortSignal
): Promise<{ text: string; userMessageId?: string; aiMessageId?: string }> {
  const modelLowerCase = model.toLowerCase();
  const config = getModelConfig(model);
  const provider = (config?.provider || 'google').toLowerCase();
  const reasoningLevel = localStorage.getItem('reasoningLevel') || 'off';

  const thinkingBudget = config?.thinkingBudgets?.[reasoningLevel] || 4096;

  const trimmedSystemPrompt = (systemPrompt || '').trim();
  const historyWithSystemPrompt: Message[] = trimmedSystemPrompt
    ? [{ role: 'system', parts: [{ text: trimmedSystemPrompt }] }, ...messagesHistory]
    : messagesHistory;

  if (useServer) {
    const userApiKey = getApiKeyForProvider(provider);
    const lastMessageText = messagesHistory.at(-1)?.parts?.[0]?.text ?? '';

    const headers: Record<string, string> = {};
    if (userApiKey) {
      headers['x-user-api-key'] = userApiKey;
    }

    const response = await apiFetch(`/chats/${chatId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: lastMessageText,
        messages: historyWithSystemPrompt,
        model: modelLowerCase,
        provider,
        reasoningLevel,
        thinkingBudget,
      }),
      signal,
    });

    if (response.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }

    if (!response.ok) {
      let errorMessage = 'Error en la respuesta del servidor proxy';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Fallback a mensaje por defecto si la respuesta no es JSON válido
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return { text: data.text, userMessageId: data.userMessageId, aiMessageId: data.aiMessageId };
  } else {
    return await fetchFromProvider(model, historyWithSystemPrompt, reasoningLevel, signal);
  }
}