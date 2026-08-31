import { describe, it, expect } from 'vitest';
import { buildChatFromTemplate, type ChatTemplate } from './chatTemplates';

// A made-up template on purpose: these tests are about the builder, and asserting on the
// real registry would make them fail every time somebody rewords the tutorial.
const template: ChatTemplate = {
    id: 'fixture',
    label: 'Fixture',
    title: 'A fixture chat',
    systemPrompt: 'Be brief.',
    systemPromptEnabled: true,
    notes: '## My level\n',
    notesEnabled: true,
    messages: [
        { role: 'model', parts: [{ text: 'first' }] },
        { role: 'model', parts: [{ text: 'second' }] },
        { role: 'model', parts: [{ text: 'third' }] },
    ],
};

describe('buildChatFromTemplate', () => {
    it('gives every chat it builds an id of its own', () => {
        const first = buildChatFromTemplate(template, 'gemini-3.5-flash');
        const second = buildChatFromTemplate(template, 'gemini-3.5-flash');

        // Using the same template twice must leave two chats, not one overwriting the other.
        expect(first.id).not.toBe(second.id);
    });

    it('dates the messages in order and in the past', () => {
        const before = Date.now();
        const chat = buildChatFromTemplate(template, 'gemini-3.5-flash');

        const stamps = chat.messages.map((message) => new Date(message.createdAt ?? '').getTime());

        expect(stamps).toHaveLength(3);
        expect(stamps.every((stamp) => Number.isFinite(stamp))).toBe(true);
        // Sorted by date is how they are read back, so equal stamps would shuffle the reading order.
        expect(stamps[0]).toBeLessThan(stamps[1]);
        expect(stamps[1]).toBeLessThan(stamps[2]);
        expect(stamps[2]).toBeLessThanOrEqual(before);
    });

    it('carries the notes and the system prompt onto the chat', () => {
        const chat = buildChatFromTemplate(template, 'gemini-3.5-flash');

        expect(chat.notes).toBe('## My level\n');
        expect(chat.notesEnabled).toBe(true);
        expect(chat.systemPrompt).toBe('Be brief.');
        expect(chat.systemPromptEnabled).toBe(true);
    });

    it('takes the title from the template and the model from the caller', () => {
        const chat = buildChatFromTemplate(template, 'claude-sonnet-4-5');

        expect(chat.title).toBe('A fixture chat');
        expect(chat.model).toBe('claude-sonnet-4-5');
        expect(chat.draft).toBe('');
    });

    it('leaves the template untouched so the next build starts clean', () => {
        buildChatFromTemplate(template, 'gemini-3.5-flash');

        expect(template.messages[0].createdAt).toBeUndefined();
    });
});
