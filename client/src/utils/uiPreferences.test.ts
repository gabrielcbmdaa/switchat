import { describe, it, expect } from 'vitest';
import { fitsBothPanels, savePanelOpen, loadPanelOpen } from './uiPreferences';

function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

describe('fitsBothPanels', () => {
    // 1006 = 300 + 300 de los paneles, 3 + 3 de los separadores y 400 del mínimo del chat.
    it('cabe justo en 1006px', () => {
        setViewportWidth(1006);
        expect(fitsBothPanels()).toBe(true);
    });

    it('no cabe un pixel por debajo', () => {
        setViewportWidth(1005);
        expect(fitsBothPanels()).toBe(false);
    });
});

describe('savePanelOpen', () => {
    it('guarda lo que elige el usuario en una ventana ancha', () => {
        setViewportWidth(1400);

        savePanelOpen('right', false);

        expect(loadPanelOpen('right', true)).toBe(false);
    });

    it('no guarda un cierre en ventana estrecha, que no es una preferencia sino falta de sitio', () => {
        setViewportWidth(1400);
        savePanelOpen('right', true);

        setViewportWidth(900);
        savePanelOpen('right', false);

        // Al volver a una ventana ancha tiene que reaparecer lo que se había elegido.
        expect(loadPanelOpen('right', false)).toBe(true);
    });

    it('sí guarda una apertura en ventana estrecha: esa la pidió el usuario', () => {
        setViewportWidth(900);

        savePanelOpen('right', true);

        expect(loadPanelOpen('right', false)).toBe(true);
    });

    it('no guarda nada en móvil, donde abrir un panel es navegar', () => {
        setViewportWidth(400);

        savePanelOpen('left', false);

        expect(loadPanelOpen('left', true)).toBe(true);
    });
});
