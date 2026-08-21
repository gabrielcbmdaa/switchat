import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChatView from './ChatView';
import type { Chat } from '../types';

const NOW = Date.now();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function chat(title: string, fields: Partial<Chat> = {}): Chat {
    return { id: title, title, draft: '', messages: [], ...fields };
}

function renderChats(chatList: Chat[]) {
    render(
        <ChatView
            chatList={chatList}
            activeChatId={chatList[0]?.id ?? ''}
            onChatClick={vi.fn()}
            onCreateNewChat={vi.fn()}
            onDeleteChat={vi.fn()}
            onReTitleChat={vi.fn()}
            onTogglePin={vi.fn()}
        />
    );
}

// getAllByText devuelve los nodos en el orden en que estan en el DOM, asi que la asercion
// mide lo que se ve y no el array que se paso: es lo unico que demuestra que ordena la vista.

describe('the order of the chat list', () => {
    it('shows the most recently active chat first', () => {
        renderChats([
            chat('quiet', { createdAt: ago(10 * DAY) }),
            chat('newest', { lastMessageAt: ago(MINUTE) }),
            chat('middle', { messages: [{ role: 'user', parts: [{ text: 'hi' }], createdAt: ago(DAY) }] }),
        ]);

        const rendered = screen.getAllByText(/quiet|newest|middle/).map((node) => node.textContent);
        expect(rendered).toEqual(['newest', 'middle', 'quiet']);
    });

    // La red de seguridad, vista desde la interfaz: un chat sin lastMessageAt no se hunde, se
    // coloca por su fecha de creacion.
    it('places a chat older than the field by its birth date instead of sinking it', () => {
        renderChats([
            chat('oldest', { createdAt: ago(30 * DAY) }),
            chat('active', { lastMessageAt: ago(MINUTE) }),
            chat('legacy', { createdAt: ago(2 * DAY) }),
        ]);

        const rendered = screen.getAllByText(/oldest|active|legacy/).map((node) => node.textContent);
        expect(rendered).toEqual(['active', 'legacy', 'oldest']);
    });
});
