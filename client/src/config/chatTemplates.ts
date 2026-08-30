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

export const CHAT_TEMPLATES: ChatTemplate[] = [];

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
