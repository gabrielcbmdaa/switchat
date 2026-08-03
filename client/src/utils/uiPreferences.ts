// Preferencias de layout de los paneles laterales.
// Los arrays son la fuente de verdad: de ahí salen los tipos y la validación.
export const LEFT_PANEL_VIEWS = ['chats', 'account'] as const;
export const RIGHT_PANEL_VIEWS = ['settings', 'notes'] as const;

export type LeftPanelView = typeof LEFT_PANEL_VIEWS[number];
export type RightPanelView = typeof RIGHT_PANEL_VIEWS[number];

// Por debajo de este ancho los paneles son drawers a pantalla casi completa
// (ver index.css, @media max-width: 767px), no columnas del layout.
const MOBILE_BREAKPOINT = 768;

export function isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}
