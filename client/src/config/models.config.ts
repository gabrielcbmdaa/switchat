// ============================================================
// Registro estático de modelos y sus capacidades de thinking.
// Fuente: https://ai.google.dev/gemini-api/docs/thinking
// ============================================================

/**
 * Configuración de un modelo de IA.
 * Se puede extender en el futuro con más campos (maxOutputTokens, contextWindow, etc.)
 */
export interface ModelConfig {
    /** Niveles de esfuerzo de thinking que soporta el modelo (ej: ['low', 'high']) */
    thinkingLevels: string[];
    /** Nivel de thinking por defecto del modelo (ej: 'high', 'medium', 'off') */
    defaultThinking: string;
    /** Proveedor del modelo */
    provider: string;
}

/**
 * Diccionario de modelos conocidos con su configuración de thinking.
 * Los nombres deben coincidir con los IDs que el usuario escribe en el input de modelo.
 */
export const MODEL_REGISTRY: Record<string, ModelConfig> = {
    // ── Google Gemini 3.x ──────────────────────────────────
    'gemini-3.1-pro-preview': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
    },
    'gemini-3-flash-preview': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
    },
    'gemini-3-pro-preview': {
        thinkingLevels: ['low', 'high'],
        defaultThinking: 'high',
        provider: 'google',
    },
    'gemini-3.5-flash': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'google',
    },

    // ── Google Gemini 2.5 ──────────────────────────────────
    'gemini-2.5-pro': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
    },
    'gemini-2.5-flash': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
    },
    'gemini-2.5-flash-lite': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'off',
        provider: 'google',
    },
};

/**
 * Busca la configuración de un modelo por su nombre exacto.
 * Retorna undefined si el modelo no está en el registro.
 */
export function getModelConfig(modelName: string): ModelConfig | undefined {
    return MODEL_REGISTRY[modelName.toLowerCase()];
}
