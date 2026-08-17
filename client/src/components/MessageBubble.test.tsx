import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MessageBubble from './MessageBubble';
import type { Message } from '../types';

function answer(extra: Partial<Message> = {}): Message {
    return { _id: 'id-1', role: 'model', parts: [{ text: 'La respuesta' }], ...extra };
}

function renderBubble(msg: Message) {
    return render(<MessageBubble msg={msg} isUser={false} onDelete={() => { }} />);
}

describe('la etiqueta del modelo', () => {
    it('muestra el nivel de esfuerzo junto al nombre del modelo', () => {
        renderBubble(answer({ model: 'gemini-3.5-flash', reasoningLevel: 'high' }));

        expect(screen.getByText('gemini-3.5-flash · high')).toBeInTheDocument();
    });

    // El caso de todo lo que ya estaba guardado antes de que el campo existiera: sin esto
    // la etiqueta arrastraría un separador colgando y sin nada detrás.
    it('deja la etiqueta como estaba cuando el mensaje no trae nivel', () => {
        renderBubble(answer({ model: 'gemini-3.5-flash' }));

        expect(screen.getByText('gemini-3.5-flash')).toBeInTheDocument();
        expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });

    it('no pinta el nivel en los mensajes del usuario', () => {
        render(
            <MessageBubble
                msg={{ _id: 'id-2', role: 'user', parts: [{ text: 'La pregunta' }] }}
                isUser={true}
                onDelete={() => { }}
            />
        );

        expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });
});
