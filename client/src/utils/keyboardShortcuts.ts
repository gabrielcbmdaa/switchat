// Atajos de teclado de los paneles laterales.
//
// La lógica vive aquí y no en App.tsx por lo mismo que resizer.ts y uiPreferences.ts: es
// una decisión pura —de un evento a un lado— y así se puede probar sin montar la app.

export type PanelShortcut = 'left' | 'right';

/**
 * Traduce una pulsación a qué panel hay que abrir o cerrar, o null si no es un atajo.
 *
 * ⌘B abre el panel derecho y ⌥⌘B el izquierdo. En Linux y Windows manda Ctrl con el mismo
 * reparto.
 *
 * Se mira `event.code` y no `event.key` a propósito: en macOS, Option+B no produce una "b"
 * sino "∫", así que comparando caracteres el atajo del panel izquierdo no dispararía jamás.
 * `code` es la tecla FÍSICA, la pulses con el modificador que la pulses.
 */
export function matchPanelShortcut(event: KeyboardEvent): PanelShortcut | null {
    if (event.code !== 'KeyB') return null;
    // Cmd en macOS, Ctrl en Linux y Windows. Se aceptan los dos en todas partes: distinguir
    // el sistema operativo por el navegador es adivinar, y esto no es ambiguo.
    if (!event.metaKey && !event.ctrlKey) return null;
    // Shift no entra en ningún atajo nuestro: ⌘⇧B es la barra de marcadores del navegador,
    // y robársela sería peor que no tener atajo.
    if (event.shiftKey) return null;
    return event.altKey ? 'left' : 'right';
}
