import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderChats(chatList: Chat[], onTogglePin = vi.fn()) {
    render(
        <ChatView
            chatList={chatList}
            activeChatId={chatList[0]?.id ?? ''}
            onChatClick={vi.fn()}
            onCreateNewChat={vi.fn()}
            onDeleteChat={vi.fn()}
            onReTitleChat={vi.fn()}
            onTogglePin={onTogglePin}
        />
    );

    return onTogglePin;
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

// La chincheta se pide por su etiqueta y no por el icono: es lo que oye quien navega con un
// lector de pantalla, y ahi el boton no dice "pin" sino lo que va a pasar si lo pulsas.
describe('the pin button of the chat list', () => {
    it('lifts a pinned chat to the top even when it is the oldest one', () => {
        renderChats([
            chat('busy', { lastMessageAt: ago(MINUTE) }),
            chat('reference', { createdAt: ago(30 * DAY), pinned: true }),
        ]);

        const rendered = screen.getAllByText(/busy|reference/).map((node) => node.textContent);
        expect(rendered).toEqual(['reference', 'busy']);
    });

    it('asks to pin a loose chat and to unpin a pinned one', () => {
        renderChats([chat('pinned', { pinned: true }), chat('loose')]);

        expect(screen.getByLabelText('Unpin chat')).toBeTruthy();
        expect(screen.getByLabelText('Pin chat')).toBeTruthy();
    });

    it('reports which chat was clicked', async () => {
        const onTogglePin = renderChats([chat('pinned', { pinned: true }), chat('loose')]);

        await userEvent.click(screen.getByLabelText('Pin chat'));

        expect(onTogglePin).toHaveBeenCalledWith('loose');
    });

    // El clic pertenece al boton, no a la fila: sin el stopPropagation, fijar un chat te
    // llevaria ademas a esa conversacion, que no es lo que pediste.
    it('does not select the chat it pins', async () => {
        const onChatClick = vi.fn();
        render(
            <ChatView
                chatList={[chat('loose')]}
                activeChatId="loose"
                onChatClick={onChatClick}
                onCreateNewChat={vi.fn()}
                onDeleteChat={vi.fn()}
                onReTitleChat={vi.fn()}
                onTogglePin={vi.fn()}
            />
        );

        await userEvent.click(screen.getByLabelText('Pin chat'));

        expect(onChatClick).not.toHaveBeenCalled();
    });
});
