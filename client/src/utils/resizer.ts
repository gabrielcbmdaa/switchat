export type SidebarSide = 'left' | 'right';

export function initResizer(side: SidebarSide = 'left'): () => void {
    const isLeft = side === 'left';
    const resizerId = isLeft ? 'left-resizer' : 'right-resizer';
    const panelId = isLeft ? 'sidebar-section' : 'settings-section';
    const oppositeId = isLeft ? 'settings-section' : 'sidebar-section';
    const storageKey = isLeft ? 'sidebarWidth' : 'rightSidebarWidth';

    const resizer = document.getElementById(resizerId);
    const panelSection = document.getElementById(panelId);

    if (!resizer || !panelSection) return () => {};

    const MIN_WIDTH = 300;
    const MESSAGE_MIN_WIDTH = 400;

    // Función dinámica para calcular el ancho total de resizers presentes en el DOM (0px, 3px o 6px)
    const getResizersTotalWidth = () => {
        const leftResizer = document.getElementById('left-resizer');
        const rightResizer = document.getElementById('right-resizer');
        let totalWidth = 0;
        if (leftResizer) totalWidth += (leftResizer.getBoundingClientRect().width || 3);
        if (rightResizer) totalWidth += (rightResizer.getBoundingClientRect().width || 3);
        return totalWidth;
    };

    // Función helper DRY para calcular el ancho máximo permitido para la barra lateral
    const calculateMaxWidth = () => {
        const oppositeSidebar = document.getElementById(oppositeId);
        const oppositeWidth = oppositeSidebar ? oppositeSidebar.getBoundingClientRect().width : 0;
        const resizersTotalWidth = getResizersTotalWidth();
        return window.innerWidth - oppositeWidth - MESSAGE_MIN_WIDTH - resizersTotalWidth;
    };

    // Restaurar ancho guardado en localStorage si existe, validando los límites
    const savedWidthStr = localStorage.getItem(storageKey);
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