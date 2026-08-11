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

export type PanelSide = 'left' | 'right';

const VIEW_KEYS: Record<PanelSide, string> = { left: 'leftPanelView', right: 'rightPanelView' };
const OPEN_KEYS: Record<PanelSide, string> = { left: 'leftPanelOpen', right: 'rightPanelOpen' };
const ACTIVE_CHAT_KEY = 'activeChatId';

// Safari en modo privado puede lanzar al escribir: la preferencia es opcional,
// nunca debe tumbar la app.
function readItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeItem(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Sin persistencia disponible; seguimos con el estado en memoria.
    }
}

export function loadPanelView(side: 'left', fallback: LeftPanelView): LeftPanelView;
export function loadPanelView(side: 'right', fallback: RightPanelView): RightPanelView;
export function loadPanelView(side: PanelSide, fallback: string): string {
    const allowed: readonly string[] = side === 'left' ? LEFT_PANEL_VIEWS : RIGHT_PANEL_VIEWS;
    const saved = readItem(VIEW_KEYS[side]);
    return saved !== null && allowed.includes(saved) ? saved : fallback;
}

export function savePanelView(side: PanelSide, view: LeftPanelView | RightPanelView) {
    writeItem(VIEW_KEYS[side], view);
}

export function loadPanelOpen(side: PanelSide, fallback: boolean): boolean {
    const saved = readItem(OPEN_KEYS[side]);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return fallback;
}

// Qué chat estabas mirando es una preferencia de esta pestaña, no un dato del chat:
// se guarda siempre, con sesión o sin ella. Los chats online viven en Mongo, pero
// cuál tenías abierto no es algo que el servidor deba saber.
export function loadActiveChatId(): string {
    return readItem(ACTIVE_CHAT_KEY) ?? '';
}

export function saveActiveChatId(chatId: string) {
    writeItem(ACTIVE_CHAT_KEY, chatId);
}

export function savePanelOpen(side: PanelSide, isOpen: boolean) {
    // En móvil abrir/cerrar el drawer es navegación (seleccionar un chat lo cierra),
    // no una preferencia de layout: no debe pisar lo elegido en escritorio.
    if (isMobileViewport()) return;
    writeItem(OPEN_KEYS[side], `${isOpen}`);
}
