import { render, screen, fireEvent } from '@testing-library/react';
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
