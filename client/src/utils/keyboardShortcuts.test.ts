import { describe, it, expect } from 'vitest';
import { matchPanelShortcut } from './keyboardShortcuts';

function keydown(init: KeyboardEventInit): KeyboardEvent {
    return new KeyboardEvent('keydown', init);
}

describe('matchPanelShortcut', () => {
    it('⌘B es el panel derecho', () => {
        expect(matchPanelShortcut(keydown({ code: 'KeyB', metaKey: true }))).toBe('right');
    });

    it('⌥⌘B es el izquierdo', () => {
        expect(matchPanelShortcut(keydown({ code: 'KeyB', metaKey: true, altKey: true }))).toBe('left');
    });

    it('en Linux y Windows manda Ctrl, con el mismo reparto', () => {
        expect(matchPanelShortcut(keydown({ code: 'KeyB', ctrlKey: true }))).toBe('right');
        expect(matchPanelShortcut(keydown({ code: 'KeyB', ctrlKey: true, altKey: true }))).toBe('left');
    });

    it('reconoce la tecla aunque Option escriba otro carácter, que es lo que pasa en macOS', () => {
        // Esto es literalmente lo que llega en un Mac al pulsar ⌥⌘B: key vale "∫", no "b".
        const event = keydown({ code: 'KeyB', key: '∫', metaKey: true, altKey: true });

        expect(matchPanelShortcut(event)).toBe('left');
    });

    it('una B a secas no es un atajo: se está escribiendo', () => {
        expect(matchPanelShortcut(keydown({ code: 'KeyB', key: 'b' }))).toBeNull();
    });

    it('deja pasar ⌘⇧B, que es del navegador', () => {
        expect(matchPanelShortcut(keydown({ code: 'KeyB', metaKey: true, shiftKey: true }))).toBeNull();
    });

    it('ignora cualquier otra tecla con el mismo modificador', () => {
        expect(matchPanelShortcut(keydown({ code: 'KeyN', metaKey: true }))).toBeNull();
    });
});
