import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MessageView from './MessageView';
import type { Message } from '../types';

function message(role: 'user' | 'model', text: string): Message {
    return { _id: `id-${text}`, role, parts: [{ text }] };
}

const messages: Message[] = [
    message('user', 'pregunta vieja'),
    message('model', 'respuesta vieja'),
];

// MessageView pide muchas props y solo tres importan aquí: el resto son los mínimos
// para que monte. onLoadMore es la que el test observa.
function renderMessageView(onLoadMore: () => void) {
    return render(
        <MessageView
            messages={messages}
            chatId="chat-a"
            hasMoreMap={{}}
            loadedChatIds={{ 'chat-a': true }}
            onLoadMore={onLoadMore}
            onDeleteMessage={() => { }}
            onRetryMessage={() => { }}
            token="un-token"
            draft=""
            onDraftChange={() => { }}
            onSendMessage={() => { }}
        />
    );
}

describe('cargar mensajes antiguos', () => {
    it('ya no ofrece un botón: el scroll es el único gesto', () => {
        renderMessageView(() => { });

        expect(screen.queryByText(/load earlier messages/i)).not.toBeInTheDocument();
    });

    it('pide más al llegar arriba del todo, que es lo que sustituye al botón', () => {
        const onLoadMore = vi.fn();
        renderMessageView(onLoadMore);

        // jsdom no calcula layout, pero scrollTop arranca en 0, que es justo el caso que
        // dispara la carga (handleScroll pide más por debajo de 300px del techo).
        const scroller = screen
            .getByText('pregunta vieja')
            .closest('[class*="messageViewContainer"]') as HTMLElement;
        fireEvent.scroll(scroller);

        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
});

describe('the editor follows the message, not the seat', () => {
    // Loading older turns prepends them. A key that is just 0, 1, 2 would leave the
    // open editor on seat 0, which is now a different message, and Save would rewrite
    // the wrong turn.
    it('keeps the open editor on the message that was being edited', async () => {
        const onSaveMessage = vi.fn();
        const current: Message[] = [
            message('user', 'pregunta actual'),
            message('model', 'respuesta actual'),
        ];
        const viewProps = {
            chatId: 'chat-a',
            hasMoreMap: {},
            loadedChatIds: { 'chat-a': true },
            onLoadMore: () => { },
            onDeleteMessage: () => { },
            onRetryMessage: () => { },
            onSaveMessage,
            token: 'un-token',
            draft: '',
            onDraftChange: () => { },
            onSendMessage: () => { },
        };
        const { rerender } = render(
            <MessageView messages={current} {...viewProps} />
        );

        await userEvent.click(screen.getByTitle('Edit message'));
        const editor = screen.getAllByRole('textbox').find((el) => (el as HTMLTextAreaElement).value === 'pregunta actual');
        expect(editor).toBeDefined();
        await userEvent.clear(editor!);
        await userEvent.type(editor!, 'pregunta corregida');

        rerender(
            <MessageView
                messages={[
                    message('user', 'pregunta vieja'),
                    message('model', 'respuesta vieja'),
                    ...current,
                ]}
                {...viewProps}
            />
        );

        await userEvent.click(screen.getByTitle('Save'));

        expect(onSaveMessage).toHaveBeenCalledWith(2, 'pregunta corregida');
    });
});
