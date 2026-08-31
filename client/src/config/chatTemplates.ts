import type { Chat, Message } from '../types';

export interface ChatTemplate {
    id: string;
    label: string;
    title: string;
    systemPrompt?: string;
    systemPromptEnabled?: boolean;
    notes?: string;
    notesEnabled?: boolean;
    messages: Message[];
}

export const CHAT_TEMPLATES: ChatTemplate[] = [
    {
        id: 'welcome',
        label: '🚀 Welcome & Tutorial',
        title: '🚀 Welcome & Tutorial',
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
                parts: [{ text: "## Chats and Notes\n\n- **Chats:** the list on the left — create, rename or delete conversations.\n- **Notes:** a panel on the right for jotting things down, saved with the chat you have open. Select text in any message and use **Send to Notes**.\n- Whatever you leave typed in the message box is saved per chat.\n- The privacy policy and the terms open from the sign-up form, in **Account**.\n\nWhen you are ready: save your key, open a new chat and start writing. Feel free to keep this tutorial around or delete it whenever you like." }]
            }
        ],
    },
];

export function getChatTemplate(templateId: string): ChatTemplate | undefined {
    return CHAT_TEMPLATES.find((template) => template.id === templateId);
}

// Turns a template into a brand new chat. The template itself is never modified: it is
// module-level data shared by every build, so writing dates into it would leak the first
// chat's timestamps into all the later ones.
export function buildChatFromTemplate(template: ChatTemplate, model: string): Chat {
    // One second apart and backdated, so the last message lands just before now. Messages
    // are read back sorted by date, and a whole template stamped with a single instant
    // comes out of that sort shuffled. The server stages them the same way in syncChat.
    const baseTime = Date.now() - template.messages.length * 1000;

    return {
        // Not 'chat-' + Date.now() like createDraftChat: a template can be used twice, and
        // two builds inside the same millisecond would share an id that Mongo requires unique.
        id: `chat-${crypto.randomUUID()}`,
        title: template.title,
        draft: '',
        createdAt: new Date().toISOString(),
        model,
        systemPrompt: template.systemPrompt,
        systemPromptEnabled: template.systemPromptEnabled,
        notes: template.notes,
        notesEnabled: template.notesEnabled,
        messages: template.messages.map((message, index) => ({
            ...message,
            createdAt: new Date(baseTime + index * 1000).toISOString(),
        })),
    };
}
