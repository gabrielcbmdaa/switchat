import type { Message } from '../types';

export const NOTES_INSTRUCTION =
    'The user keeps a personal notes notebook in this app. Use it as context when it helps answer. Do not mention the notebook unless the user asks about it or it is needed to answer.';

export function isNotesEnabled(notesEnabled?: boolean): boolean {
    return notesEnabled === true;
}

export function buildNotesSystemText(notesText: string): string | undefined {
    const trimmed = notesText.trim();
    if (!trimmed) return undefined;
    return `${NOTES_INSTRUCTION}\n\n<user_notes>\n${trimmed}\n</user_notes>`;
}

export function composeProviderHistory(
    messagesHistory: Message[],
    systemPrompt?: string,
    notesText?: string
): Message[] {
    const prefix: Message[] = [];
    const trimmedPrompt = (systemPrompt || '').trim();
    if (trimmedPrompt) {
        prefix.push({ role: 'system', parts: [{ text: trimmedPrompt }] });
    }
    const notesBlock = buildNotesSystemText(notesText || '');
    if (notesBlock) {
        prefix.push({ role: 'system', parts: [{ text: notesBlock }] });
    }
    return [...prefix, ...messagesHistory];
}
