import type { Chat } from '../types';

// How the sidebar decides which conversation goes on top.
//
// The criterion is the last message, not the birth date: a chat started three months ago and
// written in ten minutes ago belongs at the top, not buried under conversations that were
// merely created later.

/**
 * When the chat last saw activity, as a timestamp in milliseconds.
 *
 * Takes the LARGEST of its three candidates rather than the first one present, and that is
 * the whole trick:
 *
 * - `lastMessageAt` is what the server knows, and it is the only source for a chat whose
 *   messages have not been loaded — signed in, the list arrives with `messages: []`.
 * - The newest loaded message is fresher than the server's copy the moment an answer lands,
 *   because that copy predates the request. Taking the max is what makes the row climb
 *   without waiting for a reload, and what makes the signed-out mode work with no new field
 *   at all: there the messages always travel inside the chat.
 * - `createdAt` is the safety net for chats stored before any of this existed.
 *
 * With none of the three it returns 0 and the chat sinks to the bottom, which is the only
 * honest answer for a conversation that carries no date anywhere.
 */
export function chatActivityAt(chat: Chat): number {
    const candidates = [
        chat.lastMessageAt,
        chat.messages[chat.messages.length - 1]?.createdAt,
        chat.createdAt,
    ];

    return candidates.reduce<number>((newest, iso) => {
        if (!iso) return newest;
        const time = new Date(iso).getTime();
        // A date the browser cannot parse is not a reason to sink the chat: ignore it and let
        // the remaining candidates answer.
        return Number.isNaN(time) ? newest : Math.max(newest, time);
    }, 0);
}

/**
 * The chats newest-first, in a NEW array. It never sorts in place: the list it receives is
 * React state, and reordering that array behind React's back is a mutation nobody asked for.
 */
export function sortChatsByActivity(chats: Chat[]): Chat[] {
    return [...chats].sort((a, b) => chatActivityAt(b) - chatActivityAt(a));
}
