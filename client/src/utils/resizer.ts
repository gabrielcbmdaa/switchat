export function initResizer() {
    const resizer = document.getElementById('resizer');
    const sidebarSection = document.getElementById('sidebar-section');

    if (!resizer || !sidebarSection) return;

    let xCoordinate = 0;
    let sidebarWidth = 0;

    const mouseMoveHandler = function (e: MouseEvent) {
        // Cuántos píxeles se ha movido el mouse desde el click inicial
        const deltaX = e.clientX - xCoordinate;

        // Al mover a la derecha (deltaX positivo), el panel izquierdo (sidebar) se agranda
        let newSidebarWidth = sidebarWidth + deltaX;

        // Límites para el sidebar
        const MIN_WIDTH = 300;

        // Dejamos el espacio mínimo para la sección de mensajes (derecha)
        const MESSAGE_MIN_WIDTH = 400;
        const resizerWidth = resizer.getBoundingClientRect().width || 3;

        const MAX_WIDTH = window.innerWidth - MESSAGE_MIN_WIDTH - resizerWidth;

        // Aplicamos candados
        if (newSidebarWidth < MIN_WIDTH) {
            newSidebarWidth = MIN_WIDTH;
        } else if (newSidebarWidth > MAX_WIDTH) {
            newSidebarWidth = MAX_WIDTH;
        }

        // Modificamos el ancho del panel izquierdo
        sidebarSection.style.width = `${newSidebarWidth}px`;
    };

    const mouseUpHandler = function () {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    resizer.addEventListener('mousedown', function (e: MouseEvent) {
        xCoordinate = e.clientX;
        // Medimos el ancho actual del sidebar antes de empezar a arrastrar
        sidebarWidth = sidebarSection.getBoundingClientRect().width;

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);

        e.preventDefault();
    });
}