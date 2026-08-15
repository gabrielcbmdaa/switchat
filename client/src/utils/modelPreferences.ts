import { getModelConfig, isRetiredModel } from '../config/models.config';
import type { Chat } from '../types';

// Modelo con el que arranca la app cuando no hay ninguna preferencia guardada.
export const DEFAULT_MODEL = 'gemini-3.5-flash';

// El nivel que apaga el thinking. No sale del registro de modelos: lo añadimos
// nosotros al principio de la escala para que el slider siempre pueda bajar a cero.
const REASONING_OFF = 'off';

const MODEL_KEY = 'model';

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

// Preferencia global: solo es la semilla de los chats nuevos, no el modelo activo.
export function loadDefaultModel(): string {
    const saved = readItem(MODEL_KEY);
    return saved && getModelConfig(saved) ? saved : DEFAULT_MODEL;
}

export function saveDefaultModel(model: string) {
    writeItem(MODEL_KEY, model);
}

/**
 * Escala de reasoning que soporta un modelo, de menor a mayor esfuerzo.
 * Vacía si el modelo no está en el registro (IDs escritos a mano, LM Studio, Ollama):
 * eso es lo que hace que el slider no se renderice.
 */
export function getThinkingLevels(model: string): string[] {
    const config = getModelConfig(model);
    return config ? [REASONING_OFF, ...config.thinkingLevels] : [];
}

/**
 * Traduce un nivel guardado a uno que el modelo entienda.
 * Los niveles no son universales ('none' existe en gpt-5.6-luna pero no en Claude),
 * así que al cambiar de modelo hay que revalidar: se conserva el nivel si aplica y
 * si no se cae al que el propio modelo trae por defecto.
 */
export function resolveReasoningLevel(model: string, stored?: string): string {
    const levels = getThinkingLevels(model);
    if (levels.length === 0) return REASONING_OFF;
    if (stored && levels.includes(stored)) return stored;
    return getModelConfig(model)?.defaultThinking ?? REASONING_OFF;
}

/**
 * Sustituye los modelos retirados por la preferencia global, que es el último modelo que
 * el usuario eligió (handleModelChange la reescribe en cada cambio). Cualquier otro id se
 * devuelve intacto.
 *
 * Se llama al cargar los chats, vengan del disco o del servidor. No fuerza una escritura:
 * online serían tantas llamadas de red como chats migrados justo al entrar, y el cambio se
 * persiste solo la próxima vez que ese chat se guarde por cualquier otro motivo. Mientras
 * tanto no molesta, porque migrar es idempotente y cuesta una comparación de texto.
 */
export function migrateRetiredModels(chats: Chat[]): Chat[] {
    if (!chats.some((chat) => chat.model && isRetiredModel(chat.model))) return chats;

    const replacement = loadDefaultModel();
    return chats.map((chat) =>
        chat.model && isRetiredModel(chat.model) ? { ...chat, model: replacement } : chat
    );
}
