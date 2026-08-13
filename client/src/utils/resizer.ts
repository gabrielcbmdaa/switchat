import { isMobileViewport } from './uiPreferences';

export type SidebarSide = 'left' | 'right';

export function initResizer(side: SidebarSide): () => void {
    const isLeft = side === 'left';
    const resizerId = isLeft ? 'left-resizer' : 'right-resizer';
    const panelId = isLeft ? 'sidebar-section' : 'settings-section';
    const oppositeId = isLeft ? 'settings-section' : 'sidebar-section';
    const storageKey = isLeft ? 'sidebarWidth' : 'rightSidebarWidth';

    const resizer = document.getElementById(resizerId);
    const panelSection = document.getElementById(panelId);

    if (!resizer || !panelSection) return () => {};

    // Suelo al arrastrar. El ancho por defecto (300px) vive solo en el CSS: aqui no se
    // fija ninguno, se parte del que ya tenga el panel. Este valor tiene que coincidir con
    // el min-width de .sidebar-section / .settings-section en index.css, que es quien de
    // verdad impide que el panel se encoja mas de la cuenta.
    const MIN_WIDTH = 260;
    const MESSAGE_MIN_WIDTH = 400;

    // Ancho total que ocupan los separadores presentes en el DOM (0px, 3px o 6px). Se suma
    // lo que midan de verdad: un separador oculto mide 0 y no debe descontar nada.
    const getResizersTotalWidth = () => {
        return ['left-resizer', 'right-resizer'].reduce((total, id) => {
            const element = document.getElementById(id);
            return total + (element ? element.getBoundingClientRect().width : 0);
        }, 0);
    };

    // Función helper DRY para calcular el ancho máximo permitido para la barra lateral
    const calculateMaxWidth = () => {
        const oppositeSidebar = document.getElementById(oppositeId);
        const oppositeWidth = oppositeSidebar ? oppositeSidebar.getBoundingClientRect().width : 0;
        const resizersTotalWidth = getResizersTotalWidth();
        return window.innerWidth - oppositeWidth - MESSAGE_MIN_WIDTH - resizersTotalWidth;
    };

    // Ancho que ha pedido el usuario, sin recortar. null significa que nunca se arrastró,
    // así que manda el width por defecto del CSS y aquí no se toca nada. Se guarda en crudo
    // a propósito: el recorte depende del tamaño de la ventana, que cambia, así que se
    // recalcula en cada aplicación en vez de quedarse congelado.
    const savedWidth = parseInt(localStorage.getItem(storageKey) ?? '', 10);
    let desiredWidth: number | null = isNaN(savedWidth) ? null : savedWidth;

    // Único sitio que escribe el ancho del panel.
    // En móvil lo borra en vez de calcularlo: ahí el panel es un drawer y su ancho es cosa
    // del CSS (85vw), pero un ancho en línea le gana siempre a la hoja de estilos, así que
    // la única forma de devolverle el mando al CSS es quitar la propiedad.
    const applyWidth = () => {
        if (isMobileViewport()) {
            panelSection.style.removeProperty('width');
            return;
        }
        if (desiredWidth === null) return;
        panelSection.style.width = `${Math.max(MIN_WIDTH, Math.min(desiredWidth, calculateMaxWidth()))}px`;
    };

    applyWidth();

    let xCoordinate = 0;
    let initialWidth = 0;

    const mouseMoveHandler = function (e: MouseEvent) {
        const deltaX = e.clientX - xCoordinate;
        desiredWidth = isLeft ? (initialWidth + deltaX) : (initialWidth - deltaX);
        applyWidth();
    };

    const mouseUpHandler = function () {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);

        // Se guarda el ancho que quedó en pantalla, no el que pedía el ratón: si el arrastre
        // se pasó del máximo, lo que vale es lo que se ve.
        desiredWidth = panelSection.getBoundingClientRect().width;
        localStorage.setItem(storageKey, `${desiredWidth}`);
    };

    const mouseDownHandler = function (e: MouseEvent) {
        xCoordinate = e.clientX;
        initialWidth = panelSection.getBoundingClientRect().width;

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);

        e.preventDefault();
    };

    // El ancho se validaba solo al arrancar y al arrastrar, nunca al cambiar el tamaño de la
    // ventana: el ancho en línea se quedaba clavado, aplastando el área de mensajes al
    // achicar y pisando el drawer al cruzar a móvil. Con esto se vuelve a aplicar, y como
    // applyWidth recalcula el límite contra la ventana de ahora, los dos casos se arreglan.
    const resizeHandler = () => applyWidth();

    resizer.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('resize', resizeHandler);

    // Retorna la función de limpieza (cleanup) para desmontar event listeners en React
    return () => {
        resizer.removeEventListener('mousedown', mouseDownHandler);
        window.removeEventListener('resize', resizeHandler);
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };
}