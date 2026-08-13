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

    // Restaurar ancho guardado en localStorage si existe, validando los límites.
    // En móvil no: ahí los paneles son drawers (85vw) y el resizer está oculto, así que un
    // ancho en línea solo serviría para pisar el CSS del drawer con una medida de escritorio.
    const savedWidthStr = isMobileViewport() ? null : localStorage.getItem(storageKey);
    if (savedWidthStr) {
        let savedWidth = parseInt(savedWidthStr, 10);
        if (!isNaN(savedWidth)) {
            const maxWidth = calculateMaxWidth();
            savedWidth = Math.max(MIN_WIDTH, Math.min(savedWidth, maxWidth));
            panelSection.style.width = `${savedWidth}px`;
        }
    }

    let xCoordinate = 0;
    let initialWidth = 0;

    const mouseMoveHandler = function (e: MouseEvent) {
        const deltaX = e.clientX - xCoordinate;
        let newWidth = isLeft ? (initialWidth + deltaX) : (initialWidth - deltaX);
        const maxWidth = calculateMaxWidth();

        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxWidth));
        panelSection.style.width = `${newWidth}px`;
    };

    const mouseUpHandler = function () {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);

        const finalWidth = panelSection.getBoundingClientRect().width;
        localStorage.setItem(storageKey, `${finalWidth}`);
    };

    const mouseDownHandler = function (e: MouseEvent) {
        xCoordinate = e.clientX;
        initialWidth = panelSection.getBoundingClientRect().width;

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);

        e.preventDefault();
    };

    resizer.addEventListener('mousedown', mouseDownHandler);

    // Retorna la función de limpieza (cleanup) para desmontar event listeners en React
    return () => {
        resizer.removeEventListener('mousedown', mouseDownHandler);
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };
}