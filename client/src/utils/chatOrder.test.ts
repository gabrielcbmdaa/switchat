import { describe, it, expect } from 'vitest';
import { chatActivityAt, sortChatsByActivity } from './chatOrder';
import type { Chat, Message } from '../types';

const NOW = Date.now();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function chat(id: string, fields: Partial<Chat> = {}): Chat {
    return { id, title: id, draft: '', messages: [], ...fields };
}

function message(createdAt?: string): Message {
    return { role: 'user', parts: [{ text: 'hi' }], ...(createdAt ? { createdAt } : {}) };
}

describe('chatActivityAt', () => {
    it('prefers the last message over an older birth date', () => {
        const recent = chat('a', { createdAt: ago(30 * DAY), lastMessageAt: ago(5 * MINUTE) });

        expect(chatActivityAt(recent)).toBeGreaterThan(chatActivityAt(chat('b', { createdAt: ago(DAY) })));
    });

    // El caso que hace que la fila suba sin recargar: el chat abierto lleva sus mensajes en
    // memoria y su fecha real adelanta a la del servidor, que es anterior a la peticion.
    it('lets a freshly loaded message beat a stale lastMessageAt', () => {
        const open = chat('a', {
            lastMessageAt: ago(3 * DAY),
            messages: [message(ago(5 * MINUTE))],
        });

        expect(chatActivityAt(open)).toBe(new Date(ago(5 * MINUTE)).getTime());
    });

    // La red de seguridad. Sin ella, todo lo guardado antes del campo caeria al fondo.
    it('falls back to the birth date when there is no message date', () => {
        const legacy = chat('a', { createdAt: ago(2 * DAY) });

        expect(chatActivityAt(legacy)).toBe(new Date(ago(2 * DAY)).getTime());
    });

    it('sinks a chat that carries no date anywhere', () => {
        expect(chatActivityAt(chat('a'))).toBe(0);
    });

    it('ignores a date it cannot parse instead of sinking the chat', () => {
        const broken = chat('a', { lastMessageAt: 'not a date', createdAt: ago(DAY) });

        expect(chatActivityAt(broken)).toBe(new Date(ago(DAY)).getTime());
    });
});

describe('sortChatsByActivity', () => {
    it('puts the most recently active first', () => {
        const chats = [
            chat('quiet', { createdAt: ago(10 * DAY) }),
            chat('newest', { lastMessageAt: ago(MINUTE) }),
            chat('middle', { messages: [message(ago(DAY))] }),
        ];

        expect(sortChatsByActivity(chats).map((c) => c.id)).toEqual(['newest', 'middle', 'quiet']);
    });

    // El estado de React se pasa tal cual: reordenarlo en su sitio seria mutarlo a su espalda.
    it('leaves the array it receives untouched', () => {
        const chats = [chat('old', { createdAt: ago(10 * DAY) }), chat('new', { createdAt: ago(MINUTE) })];

        sortChatsByActivity(chats);

        expect(chats.map((c) => c.id)).toEqual(['old', 'new']);
    });

    it('keeps the original order when two chats tie', () => {
        const same = ago(DAY);
        const chats = [chat('first', { createdAt: same }), chat('second', { createdAt: same })];

        expect(sortChatsByActivity(chats).map((c) => c.id)).toEqual(['first', 'second']);
    });
});
