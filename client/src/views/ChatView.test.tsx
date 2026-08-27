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

    // The one requirement the accessibility tree cannot show: the pin of a pinned chat has to
    // be visible WITHOUT hovering the row. Without this check the class can be deleted and no
    // test notices, while the feature loses exactly what tells it apart from "the most recent
    // one". Hover is CSS and jsdom does not simulate it, so the class is what gets asserted.
    it('shows the pin of a pinned chat without hovering the row', () => {
        renderChats([chat('pinned', { pinned: true }), chat('loose')]);

        const pinnedSlot = screen.getByLabelText('Unpin chat').parentElement;
        const looseSlot = screen.getByLabelText('Pin chat').parentElement;

        expect(pinnedSlot?.className).toMatch(/pinSlotVisible/);
        expect(looseSlot?.className).not.toMatch(/pinSlotVisible/);
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

// Touch has no hover, so the three-dot button is the handle that reveals pencil, trash and
// pin. jsdom does not apply @media (hover: none); the tests check the open state, not whether
// CSS made the handle visible.
function overflowRow(label: string) {
    return screen.getByLabelText(label).parentElement?.parentElement;
}

describe('the overflow button of the chat list', () => {
    it('is labeled Chat actions', () => {
        renderChats([chat('loose')]);

        expect(screen.getByLabelText('Chat actions')).toBeTruthy();
    });

    it('does not select the chat it opens', async () => {
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

        await userEvent.click(screen.getByLabelText('Chat actions'));

        expect(onChatClick).not.toHaveBeenCalled();
    });

    it('marks the row as open', async () => {
        renderChats([chat('loose')]);

        await userEvent.click(screen.getByLabelText('Chat actions'));

        expect(overflowRow('Close chat actions')?.className).toMatch(/actionsOpen/);
    });

    it('closes the row when pressed again', async () => {
        renderChats([chat('loose')]);

        await userEvent.click(screen.getByLabelText('Chat actions'));
        await userEvent.click(screen.getByLabelText('Close chat actions'));

        expect(overflowRow('Chat actions')?.className).not.toMatch(/actionsOpen/);
        expect(screen.queryByLabelText('Close chat actions')).toBeNull();
    });

    it('keeps only one row open', async () => {
        renderChats([chat('alpha'), chat('beta')]);
        const [first, second] = screen.getAllByLabelText('Chat actions');

        await userEvent.click(first);
        const firstRow = overflowRow('Close chat actions');
        expect(firstRow?.className).toMatch(/actionsOpen/);

        await userEvent.click(second);

        expect(firstRow?.className).not.toMatch(/actionsOpen/);
        expect(overflowRow('Close chat actions')?.className).toMatch(/actionsOpen/);
    });

    it('closes when the row is selected', async () => {
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

        await userEvent.click(screen.getByLabelText('Chat actions'));
        await userEvent.click(screen.getByText('loose'));

        expect(onChatClick).toHaveBeenCalledWith('loose');
        expect(screen.queryByLabelText('Close chat actions')).toBeNull();
    });

    it('closes when New Chat is pressed', async () => {
        const onCreateNewChat = vi.fn();
        render(
            <ChatView
                chatList={[chat('loose')]}
                activeChatId="loose"
                onChatClick={vi.fn()}
                onCreateNewChat={onCreateNewChat}
                onDeleteChat={vi.fn()}
                onReTitleChat={vi.fn()}
                onTogglePin={vi.fn()}
            />
        );

        await userEvent.click(screen.getByLabelText('Chat actions'));
        await userEvent.click(screen.getByRole('button', { name: 'New Chat' }));

        expect(onCreateNewChat).toHaveBeenCalled();
        expect(screen.queryByLabelText('Close chat actions')).toBeNull();
    });
});
