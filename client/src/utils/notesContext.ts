import type { Message } from '../types';

export const NOTES_INSTRUCTION =
    'The user keeps a personal notes notebook in this app. Use it as context when it helps answer. Do not mention the notebook unless the user asks about it or it is needed to answer.';

export const NOTES_DISABLED_INSTRUCTION =
    'The user keeps a personal notes notebook in this app, but this chat cannot read it. If they ask about their notes, tell them how to turn that on: open the right-hand panel, go to Settings, and turn on the Notes switch. Do not mention this unless they ask about their notes. Do not claim you can read the notebook.';

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
    notesText?: string,
    notesEnabled?: boolean
): Message[] {
    const prefix: Message[] = [];
    const trimmedPrompt = (systemPrompt || '').trim();
    if (trimmedPrompt) {
        prefix.push({ role: 'system', parts: [{ text: trimmedPrompt }] });
    }
    if (notesEnabled === false) {
        // The notebook stays on this machine. The model only learns that a switch exists.
        prefix.push({ role: 'system', parts: [{ text: NOTES_DISABLED_INSTRUCTION }] });
    } else {
        const notesBlock = buildNotesSystemText(notesText || '');
        if (notesBlock) {
            prefix.push({ role: 'system', parts: [{ text: notesBlock }] });
        }
    }
    return [...prefix, ...messagesHistory];
}
