import { describe, it, expect } from 'vitest';
import { chatActivityAt, sortChatList } from './chatOrder';
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

describe('sortChatList', () => {
    it('puts the most recently active first', () => {
        const chats = [
            chat('quiet', { createdAt: ago(10 * DAY) }),
            chat('newest', { lastMessageAt: ago(MINUTE) }),
            chat('middle', { messages: [message(ago(DAY))] }),
        ];

        expect(sortChatList(chats).map((c) => c.id)).toEqual(['newest', 'middle', 'quiet']);
    });

    // El estado de React se pasa tal cual: reordenarlo en su sitio seria mutarlo a su espalda.
    it('leaves the array it receives untouched', () => {
        const chats = [chat('old', { createdAt: ago(10 * DAY) }), chat('new', { createdAt: ago(MINUTE) })];

        sortChatList(chats);

        expect(chats.map((c) => c.id)).toEqual(['old', 'new']);
    });

    it('keeps the original order when two chats tie', () => {
        const same = ago(DAY);
        const chats = [chat('first', { createdAt: same }), chat('second', { createdAt: same })];

        expect(sortChatList(chats).map((c) => c.id)).toEqual(['first', 'second']);
    });

    // El caso que motiva la funcionalidad entera: el chat que quieres a mano es justo el que no
    // estas escribiendo, asi que la fecha lo hunde y el pin tiene que poder mas que la fecha.
    it('lifts a pinned chat above a conversation that is being used right now', () => {
        const chats = [
            chat('busy', { lastMessageAt: ago(MINUTE) }),
            chat('reference', { createdAt: ago(30 * DAY), pinned: true }),
        ];

        expect(sortChatList(chats).map((c) => c.id)).toEqual(['reference', 'busy']);
    });

    // El pin decide el grupo, no el puesto: dentro de los fijados sigue mandando la actividad.
    it('orders the pinned chats among themselves by activity', () => {
        const chats = [
            chat('pinned-old', { createdAt: ago(10 * DAY), pinned: true }),
            chat('loose', { lastMessageAt: ago(MINUTE) }),
            chat('pinned-fresh', { lastMessageAt: ago(2 * MINUTE), pinned: true }),
        ];

        expect(sortChatList(chats).map((c) => c.id)).toEqual(['pinned-fresh', 'pinned-old', 'loose']);
    });

    // Desfijar no es un estado propio: el chat vuelve al sitio que le da su fecha, sin rastro.
    it('returns an unpinned chat to its place by date', () => {
        const chats = [
            chat('quiet', { createdAt: ago(10 * DAY), pinned: false }),
            chat('recent', { lastMessageAt: ago(MINUTE) }),
        ];

        expect(sortChatList(chats).map((c) => c.id)).toEqual(['recent', 'quiet']);
    });

    // Un chat guardado antes del campo llega sin el, y ausente tiene que leerse como no fijado
    // y no como un valor raro que rompa la comparacion.
    it('reads a chat without the field as not pinned', () => {
        const chats = [chat('legacy', { createdAt: ago(DAY) }), chat('pinned', { createdAt: ago(10 * DAY), pinned: true })];

        expect(sortChatList(chats).map((c) => c.id)).toEqual(['pinned', 'legacy']);
    });
});
