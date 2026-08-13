import { describe, it, expect, afterEach } from 'vitest';
import { initResizer } from './resizer';

// El ancho del panel solo se ve mal cuando la ventana cambia de tamaño, que es justo lo que
// no se prueba a mano: hay que acordarse de arrastrar la esquina del navegador. jsdom no
// calcula layout, pero sí deja mover window.innerWidth y disparar el evento, que es todo lo
// que necesita applyWidth para decidir.
function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    window.dispatchEvent(new Event('resize'));
}

function mountLayout() {
    document.body.innerHTML = `
        <div class="app-container">
            <div id="sidebar-section"></div>
            <div id="left-resizer"></div>
            <div id="message-section"></div>
            <div id="right-resizer"></div>
            <div id="settings-section"></div>
        </div>
    `;
    return document.getElementById('sidebar-section') as HTMLElement;
}

let cleanup: (() => void) | null = null;

afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
});

describe('initResizer', () => {
    it('recorta el ancho guardado contra la ventana actual', () => {
        localStorage.setItem('sidebarWidth', '694');
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        cleanup = initResizer('left');

        // Cabe entero: 1400 - 400 del mínimo del área de mensajes deja 1000 de margen.
        expect(panel.style.width).toBe('694px');
    });

    it('vuelve a recortarlo al achicar la ventana, sin recargar', () => {
        localStorage.setItem('sidebarWidth', '694');
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        cleanup = initResizer('left');

        setViewportWidth(800);

        // Ahora solo caben 400px de panel, y antes se quedaba clavado en 694.
        expect(panel.style.width).toBe('400px');
    });

    it('nunca baja del mínimo de 260px, aunque el máximo salga por debajo', () => {
        localStorage.setItem('sidebarWidth', '694');
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        // jsdom no calcula layout y todo mide 0, así que el panel opuesto hay que fingirlo:
        // sin él, el máximo nunca cae por debajo del mínimo y este caso no se puede probar.
        const opposite = document.getElementById('settings-section') as HTMLElement;
        opposite.getBoundingClientRect = () => ({ width: 300 }) as DOMRect;

        cleanup = initResizer('left');

        // A 900px de ventana el máximo sale 200 (900 - 300 del panel opuesto - 400 del área
        // de mensajes), por debajo del mínimo. Gana el mínimo, y por eso a esas anchuras la
        // suma de mínimos no cabe y la app desborda: es el límite conocido de este arreglo.
        setViewportWidth(900);

        expect(panel.style.width).toBe('260px');
    });

    it('suelta el ancho en línea al cruzar a móvil para que mande el CSS del drawer', () => {
        localStorage.setItem('sidebarWidth', '300');
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        cleanup = initResizer('left');
        expect(panel.style.width).toBe('300px');

        setViewportWidth(700);

        // Sin esto, el 300px en línea le ganaría al 85vw de la media query.
        expect(panel.style.width).toBe('');
    });

    it('recupera el ancho guardado al volver a escritorio', () => {
        localStorage.setItem('sidebarWidth', '300');
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        cleanup = initResizer('left');

        setViewportWidth(700);
        setViewportWidth(1400);

        expect(panel.style.width).toBe('300px');
    });

    it('no toca el panel si nunca se arrastró: el ancho por defecto es cosa del CSS', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        cleanup = initResizer('left');

        setViewportWidth(800);

        expect(panel.style.width).toBe('');
    });

    it('deja de escuchar el resize tras la limpieza', () => {
        localStorage.setItem('sidebarWidth', '694');
        Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

        const panel = mountLayout();
        const stop = initResizer('left');
        stop();

        setViewportWidth(800);

        expect(panel.style.width).toBe('694px');
    });
});
