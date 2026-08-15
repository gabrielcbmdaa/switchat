import type { Chat } from '../types';

export function getTutorialChat(): Chat[] {
    return [{
        id: 'tutorial-welcome',
        title: "🚀 Welcome & Tutorial",
        draft: '',
        messages: [
            {
                role: "model",
                parts: [{ text: "Hi! Welcome to **Switchat** — your hub for chatting with several LLMs from a single place.\n\nConnect **Google Gemini**, **Anthropic Claude**, **OpenAI ChatGPT**, **LM Studio** or **Ollama**, and switch models whenever you want." }]
            },
            {
                role: "model",
                parts: [{ text: "## Get started in 1 minute\n\n1. Open **Account** (bottom of the left panel).\n2. Paste your API key, pick its provider — Google, Anthropic or OpenAI — and press save.\n3. Open **Settings** (bottom of the right panel) and choose a model from the list, or search for one by ID.\n4. Create a new chat from **Chats** and start writing.\n\nGet a key: [Google AI Studio](https://aistudio.google.com/apikey) · [Anthropic Console](https://console.anthropic.com/settings/keys) · [OpenAI Platform](https://platform.openai.com/api-keys)." }]
            },
            {
                role: "model",
                parts: [{ text: "## Online vs Offline\n\n- **Signed out (Offline):** everything lives in your browser (`localStorage`) and nothing reaches our database.\n- **Signed in (Online):** your chats, messages and drafts sync to the server so they follow you between devices.\n\nIn **both** modes it is your browser that calls the AI provider, using your own key — the server never talks to a provider. Signing in only changes *where your conversations are stored*.\n\nYour API keys always stay in this browser, and signing in never uploads them. Each key in **Account** has its own button to store that single key in the database, encrypted, so it follows you across devices — and another to take it back out. Nothing reaches the database until you press it." }]
            },
            {
                role: "model",
                parts: [{ text: "## Model, System Prompt and Reasoning belong to each chat\n\nEverything in **Settings** applies to the chat you have open, not to the whole app — a conversation started with Claude stays on Claude while you work on another one with Gemini:\n\n- The active **model** (Gemini, Claude, GPT, or a local ID).\n- A **System Prompt** for tone, role or fixed rules, with a switch that turns it off without throwing the text away.\n- The **Reasoning** effort, when the model supports it: more effort means more thoughtful answers, at the cost of latency and tokens. The slider only shows up for models Switchat knows.\n\nFor local models, keep **LM Studio** or **Ollama** running and pick a compatible model." }]
            },
            {
                role: "model",
                parts: [{ text: "## Chats and Notes\n\n- **Chats:** the list on the left — create, rename or delete conversations.\n- **Notes:** a panel on the right for jotting things down. Select text in any message and use **Send to Notes**.\n- Whatever you leave typed in the message box is saved per chat.\n- The privacy policy and the terms open from the sign-up form, in **Account**.\n\nWhen you are ready: save your key, open a new chat and start writing. Feel free to keep this tutorial around or delete it whenever you like." }]
            }
        ]
    }];
}

// chatList en localStorage es solo para modo offline: los chats online viven en
// React state + MongoDB y no deben escribirse aquí. El chat activo NO sigue esta
// regla —es una preferencia de UI y se guarda siempre—, por eso vive en
// utils/uiPreferences.ts y no en este módulo.
export function loadLocalChats(): Chat[] {
    const localData = localStorage.getItem('chatList');

    // 1. Si no hay nada en el disco (es null), frenamos y devolvemos un array vacío
    if (!localData) {
        return [];
    }

    // 2. Si pasó el filtro de arriba, TypeScript ya SABE con 100% de certeza 
    // que 'localData' es un string real. Ya no hay peligro de 'null'.
    return JSON.parse(localData) as Chat[];
}

// 3. Función para guardar (ahora requiere que le pasemos los datos desde fuera)
export function saveToLocalDisk(chatList: Chat[]) {
    localStorage.setItem('chatList', JSON.stringify(chatList));
}

export const NOTES_STORAGE_KEY = 'switchat_notes';

export function getNotesText(): string {
    try {
        return (localStorage.getItem(NOTES_STORAGE_KEY) || '').trim();
    } catch {
        // Private mode can throw. An unreadable notebook is an empty one, not a crashed send.
        return '';
    }
}

// Notes: localStorage is the source of truth, so this works even when
// NotesView is not mounted (e.g. when sending text from the SelectionToolbar).
export function appendToNotes(text: string) {
    const prev = localStorage.getItem(NOTES_STORAGE_KEY) || '';
    const separator = prev.trim() ? '\n\n' : '';
    const updated = prev + separator + text;
    localStorage.setItem(NOTES_STORAGE_KEY, updated);
    window.dispatchEvent(new CustomEvent('sendToNotes', { detail: updated }));
    return updated;
}
