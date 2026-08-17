// Separacion entre la pildora flotante y aquello a lo que se ancla, y margen minimo con
// los bordes de la ventana.
export const FLOATING_GAP = 8;

/**
 * Coloca una pildora flotante centrada sobre un rectangulo, sin salirse del viewport.
 * Devuelve null si el rect ya no es valido o quedo fuera de pantalla.
 *
 * El ancho y el alto son parametros y no constantes del modulo porque cada pildora mide lo
 * suyo: la de los mensajes lleva dos botones y la de las notas uno solo.
 */
export function positionOver(
    rect: DOMRect,
    width: number,
    height: number
): { x: number; y: number } | null {
    // Rect vacío: el rango se invalidó (ej. re-render durante el streaming)
    if (!rect.width && !rect.height) return null;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;

    let y = rect.top - height - FLOATING_GAP;
    if (y < FLOATING_GAP) y = rect.bottom + FLOATING_GAP; // sin sitio arriba → debajo

    const rawX = rect.left + rect.width / 2 - width / 2;
    const x = Math.max(FLOATING_GAP, Math.min(rawX, window.innerWidth - width - FLOATING_GAP));

    return { x, y };
}
