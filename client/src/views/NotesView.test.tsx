import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NotesView from './NotesView';

const NOTES = 'La primera linea del cuaderno.\nLa segunda linea del cuaderno.';

// El textarea no expone su seleccion a window.getSelection(), asi que el test la prepara
// como lo hace el navegador de verdad: moviendo selectionStart y selectionEnd.
function renderNotes(onReply = vi.fn()) {
    render(<NotesView notes={NOTES} onChange={() => { }} onReply={onReply} />);
    const textarea = screen.getByPlaceholderText('Write your notes here...') as HTMLTextAreaElement;

    return { onReply, textarea };
}

function selectRange(textarea: HTMLTextAreaElement, start: number, end: number) {
    textarea.setSelectionRange(start, end);
    fireEvent.select(textarea);
}

describe('responder a lo seleccionado en las notas', () => {
    it('ofrece el boton al soltar el raton sobre una seleccion', () => {
        const { textarea } = renderNotes();

        selectRange(textarea, 0, 10);
        fireEvent.pointerUp(textarea, { clientX: 120, clientY: 200 });

        expect(screen.getByRole('button', { name: /reply/i })).toBeInTheDocument();
    });

    it('manda al prompt exactamente el texto seleccionado', () => {
        const { onReply, textarea } = renderNotes();

        selectRange(textarea, 0, 10);
        fireEvent.pointerUp(textarea, { clientX: 120, clientY: 200 });
        fireEvent.click(screen.getByRole('button', { name: /reply/i }));

        expect(onReply).toHaveBeenCalledWith('La primera');
    });

    // Un clic suelto tambien dispara pointerup: sin seleccion no hay nada que citar.
    it('no ofrece nada cuando no hay seleccion', () => {
        const { textarea } = renderNotes();

        selectRange(textarea, 5, 5);
        fireEvent.pointerUp(textarea, { clientX: 120, clientY: 200 });

        expect(screen.queryByRole('button', { name: /reply/i })).not.toBeInTheDocument();
    });

    it('cierra el boton con Escape sin mandar nada al prompt', () => {
        const { onReply, textarea } = renderNotes();

        selectRange(textarea, 0, 10);
        fireEvent.pointerUp(textarea, { clientX: 120, clientY: 200 });
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('button', { name: /reply/i })).not.toBeInTheDocument();
        expect(onReply).not.toHaveBeenCalled();
    });

    // Al vaciarse la seleccion (escribir, mover el cursor) la pildora ya no apunta a nada.
    it('cierra el boton cuando la seleccion se vacia', () => {
        const { textarea } = renderNotes();

        selectRange(textarea, 0, 10);
        fireEvent.pointerUp(textarea, { clientX: 120, clientY: 200 });
        selectRange(textarea, 10, 10);

        expect(screen.queryByRole('button', { name: /reply/i })).not.toBeInTheDocument();
    });
});
