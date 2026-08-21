import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
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

describe('the message timestamp', () => {
    // Anchored to the clock the test runs on, so the expected label cannot go stale the way
    // a hardcoded date would.
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

    it('reports how long ago the message was sent', () => {
        const { container } = renderBubble(answer({ createdAt: minutesAgo(12) }));

        expect(screen.getByText('12m ago')).toBeInTheDocument();
        // The machine-readable half of the element, which is what makes it a <time>.
        expect(container.querySelector('time')).toHaveAttribute('dateTime');
    });

    it('carries the full date in the tooltip, behind the relative label', () => {
        const { container } = renderBubble(answer({ createdAt: minutesAgo(12) }));

        expect(container.querySelector('time')?.title).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    // Everything stored before the field existed. Rendering an empty element here would
    // leave a gap in the row for no reason.
    it('renders no time at all when the message carries no date', () => {
        const { container } = renderBubble(answer());

        expect(container.querySelector('time')).toBeNull();
    });

    // The "Thinking..." bubble and the error ones do carry a date, but they delete
    // themselves: announcing when they appeared is noise.
    it('stays quiet on a temporary message', () => {
        const { container } = renderBubble(answer({ createdAt: minutesAgo(0), isTemporary: true }));

        expect(container.querySelector('time')).toBeNull();
    });

    it('sits next to the model label without merging with it', () => {
        renderBubble(answer({
            createdAt: minutesAgo(12),
            model: 'gemini-3.5-flash',
            reasoningLevel: 'high',
        }));

        expect(screen.getByText('gemini-3.5-flash · high')).toBeInTheDocument();
        expect(screen.getByText('12m ago')).toBeInTheDocument();
    });
});

describe('editing a user message', () => {
    function userMessage(extra: Partial<Message> = {}): Message {
        return { _id: 'id-2', role: 'user', parts: [{ text: 'La pregunta' }], ...extra };
    }

    it('shows a pencil on a user bubble', () => {
        render(<MessageBubble msg={userMessage()} isUser={true} onDelete={() => { }} onSave={() => { }} />);

        expect(screen.getByTitle('Edit message')).toBeInTheDocument();
    });

    it('hides the pencil on a model bubble', () => {
        renderBubble(answer());

        expect(screen.queryByTitle('Edit message')).not.toBeInTheDocument();
    });

    it('hides the pencil on a temporary user bubble', () => {
        render(
            <MessageBubble
                msg={userMessage({ isTemporary: true })}
                isUser={true}
                onDelete={() => { }}
                onSave={() => { }}
            />
        );

        expect(screen.queryByTitle('Edit message')).not.toBeInTheDocument();
    });

    it('opens a textarea with the raw text', async () => {
        render(<MessageBubble msg={userMessage()} isUser={true} onDelete={() => { }} onSave={() => { }} />);

        await userEvent.click(screen.getByTitle('Edit message'));

        expect(screen.getByRole('textbox')).toHaveValue('La pregunta');
    });

    it('restores the original text on cancel and does not save', async () => {
        const onSave = vi.fn();
        render(<MessageBubble msg={userMessage()} isUser={true} onDelete={() => { }} onSave={onSave} />);

        await userEvent.click(screen.getByTitle('Edit message'));
        await userEvent.clear(screen.getByRole('textbox'));
        await userEvent.type(screen.getByRole('textbox'), 'otra cosa');
        await userEvent.click(screen.getByTitle('Cancel'));

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByText('La pregunta')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('saves the edited text', async () => {
        const onSave = vi.fn();
        render(<MessageBubble msg={userMessage()} isUser={true} onDelete={() => { }} onSave={onSave} />);

        await userEvent.click(screen.getByTitle('Edit message'));
        await userEvent.clear(screen.getByRole('textbox'));
        await userEvent.type(screen.getByRole('textbox'), 'pregunta corregida');
        await userEvent.click(screen.getByTitle('Save'));

        expect(onSave).toHaveBeenCalledWith('pregunta corregida');
    });
});
