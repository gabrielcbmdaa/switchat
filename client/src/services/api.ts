import type { Chat, Message } from "../types";
import { fetchFromProvider } from "./providers";

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

export async function checkSession(): Promise<{ authenticated: boolean; userId?: string; email?: string }> {
  try {
    const response = await apiFetch('/auth/me');
    if (!response.ok) return { authenticated: false };
    const data = await response.json();
    return {
      authenticated: Boolean(data.authenticated),
      userId: data.userId ? String(data.userId) : undefined,
      email: data.email ? String(data.email) : undefined,
    };
  } catch (error) {
    console.error('❌ Error [checkSession]:', error);
    return { authenticated: false };
  }
}

export async function loginOrRegister(email: string, password: string, isSignUp: boolean, acceptedTerms = false) {
  const endpoint = isSignUp ? '/auth/register' : '/auth/login';
  const body = isSignUp ? { email, password, acceptedTerms } : { email, password };
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
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

export async function updateEmail(newEmail: string, currentPassword: string): Promise<{ email: string }> {
  const response = await apiFetch('/auth/email', {
    method: 'PATCH',
    body: JSON.stringify({ newEmail, currentPassword }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo actualizar el correo');
  }

  return { email: data.email };
}

export async function updatePassword(newPassword: string, currentPassword: string): Promise<void> {
  const response = await apiFetch('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ newPassword, currentPassword }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'No se pudo actualizar la contraseña');
  }
}

export async function deleteAccountFromServer(currentPassword: string): Promise<void> {
  const response = await apiFetch('/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ currentPassword }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'No se pudo eliminar la cuenta');
  }
}

// ============================================================================
// Custodia de API Keys en Servidor
// ============================================================================

export interface RemoteApiKey {
  provider: string;
  key: string;
  isActive: boolean;
}

/**
 * Baja las API keys de la cuenta, ya descifradas.
 * Devuelve null si no se pudieron leer: quien llama debe dejar localStorage intacto,
 * porque sobrescribirlo con una lista vacía borraría las keys locales del usuario.
 */
export async function fetchApiKeysFromServer(): Promise<RemoteApiKey[] | null> {
  try {
    const response = await apiFetch('/keys');
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.keys) ? data.keys : null;
  } catch (error) {
    console.error('⚠️ Error [fetchApiKeysFromServer]:', (error as Error).message);
    return null;
  }
}

/**
 * Sustituye el conjunto completo de API keys de la cuenta.
 * Es un reemplazo, no un alta: lo que no viaje aquí se borra del servidor, que es
 * justamente lo que impide que una key borrada resucite en el siguiente inicio de sesión.
 */
export async function replaceApiKeysOnServer(keys: RemoteApiKey[]): Promise<boolean> {
  try {
    const response = await apiFetch('/keys', {
      method: 'PUT',
      body: JSON.stringify({ keys }),
    });
    return response.ok;
  } catch (error) {
    console.error('⚠️ Error [replaceApiKeysOnServer]:', (error as Error).message);
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

const TITLE_CONTEXT_LIMIT = 500;

/**
 * Prompt único para titular un chat: lo usan tanto el camino online como el offline.
 */
function buildTitlePrompt(promptText: string, replyText: string): string {
  return [
    'Genera un título breve (máximo 5 palabras) para esta conversación, en el mismo idioma que escribe el usuario.',
    'Responde solo con el título: sin comillas, sin markdown y sin punto final.',
    '',
    `Usuario: ${promptText.slice(0, TITLE_CONTEXT_LIMIT)}`,
    `Asistente: ${replyText.slice(0, TITLE_CONTEXT_LIMIT)}`,
  ].join('\n');
}

/**
 * Los modelos suelen añadir comillas, markdown o una frase de cortesía: nos quedamos
 * con la primera línea limpia y acotada para que quepa en la barra lateral.
 */
function sanitizeTitle(rawTitle: string): string {
  const firstLine = rawTitle.split('\n').map((line) => line.trim()).find(Boolean) || '';

  return firstLine
    .replace(/^#+\s*/, '')
    .replace(/\*+/g, '')
    .replace(/^["'«“¿¡]+|["'»”]+$/g, '')
    .replace(/[.…]+$/, '')
    .trim()
    .slice(0, 60);
}

/**
 * Pide al modelo activo un título para el chat tras el primer intercambio.
 * Nunca lanza: si algo falla el chat se queda con su título provisional.
 */
export async function generateChatTitle(
  promptText: string,
  replyText: string,
  model: string
): Promise<string | null> {
  const messages: Message[] = [{ role: 'user', parts: [{ text: buildTitlePrompt(promptText, replyText) }] }];

  try {
    // Sin thinking: titular es una tarea corta y no debe gastar presupuesto de razonamiento
    const { text } = await fetchFromProvider(model, messages, 'off');
    return sanitizeTitle(text || '') || null;

  } catch (error) {
    const err = error as Error;
    console.warn('⚠️ Error [generateChatTitle]:', err.message);
    return null;
  }
}

/**
 * Guarda un mensaje ya resuelto y devuelve el _id que le asignó MongoDB.
 *
 * El servidor no llama a proveedores: solo persiste. Por eso un intercambio son dos
 * llamadas —el prompt antes de generar y la respuesta después— en vez de una.
 * El _id que devuelve es lo que después permite borrar el mensaje del servidor.
 */
export async function saveMessageToServer(
  chatId: string,
  message: { sender: 'user' | 'ai'; content: string; model?: string }
): Promise<string | undefined> {
  const response = await apiFetch(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(message),
  });

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'No se pudo guardar el mensaje en el servidor');
  }

  const data = await response.json();
  return data._id;
}

/**
 * Pide la respuesta al proveedor. Siempre desde el navegador: el servidor nunca llama
 * a un proveedor, así que aquí ya no hay dos caminos que mantener en sync.
 *
 * Lo único que añade sobre fetchFromProvider es anteponer el system prompt del chat,
 * que es lo que hace que quien llama no tenga que saber cómo se representa.
 */
export async function fetchChatResponse(
  messagesHistory: Message[],
  model: string,
  reasoningLevel: string,
  systemPrompt?: string,
  signal?: AbortSignal
): Promise<{ text: string }> {
  const trimmedSystemPrompt = (systemPrompt || '').trim();
  const historyWithSystemPrompt: Message[] = trimmedSystemPrompt
    ? [{ role: 'system', parts: [{ text: trimmedSystemPrompt }] }, ...messagesHistory]
    : messagesHistory;

  return await fetchFromProvider(model, historyWithSystemPrompt, reasoningLevel, signal);
}