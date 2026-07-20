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
    /** Mapeo de nivel de thinking a budget_tokens para el proveedor */
    thinkingBudgets: Record<string, number>;
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
        thinkingBudgets: {},
    },
    'gemini-3-flash-preview': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3-pro-preview': {
        thinkingLevels: ['low', 'high'],
        defaultThinking: 'high',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3.5-flash': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3.1-flash-lite': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'minimal',
        provider: 'google',
        thinkingBudgets: {},
    },

    // ── Google Gemini 2.5 ──────────────────────────────────
    'gemini-2.5-pro': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-2.5-flash': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-2.5-flash-lite': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'off',
        provider: 'google',
        thinkingBudgets: {},
    },
    // ── Anthropic Claude ─────────────────────────────────────
    'claude-fable-5': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'anthropic',
        thinkingBudgets: {
            minimal: 2048,
            low: 8192,
            medium: 16384,
            high: 32768,
        },
    },
    'claude-opus-4-8': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'anthropic',
        thinkingBudgets: {
            minimal: 2048,
            low: 8192,
            medium: 16384,
            high: 32768,
        },
    },
    'claude-sonnet-5': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'anthropic',
        thinkingBudgets: {
            minimal: 1024,
            low: 4096,
            medium: 8192,
            high: 16384,
        },
    },
    'claude-haiku-4-5-20251001': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'anthropic',
        thinkingBudgets: {
            minimal: 1024,
            low: 2048,
            medium: 4096,
            high: 8192,
        },
    },
    'claude-haiku-4-5': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'anthropic',
        thinkingBudgets: {
            minimal: 1024,
            low: 2048,
            medium: 4096,
            high: 8192,
        },
    },
    // ── OpenAI GPT & Reasoning ──────────────────────────────
    'gpt-5.6-sol': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        defaultThinking: 'high',
        provider: 'openai',
        thinkingBudgets: {},
    },
    'gpt-5.6-terra': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'openai',
        thinkingBudgets: {},
    },
    'gpt-5.6-luna': {
        thinkingLevels: ['minimal', 'low', 'medium'],
        defaultThinking: 'low',
        provider: 'openai',
        thinkingBudgets: {},
    },
    'gpt-5.5': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'openai',
        thinkingBudgets: {},
    },
    'gpt-5.4-mini': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'openai',
        thinkingBudgets: {},
    },
    'o3-mini': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'openai',
        thinkingBudgets: {},
    },
    'o1': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'openai',
        thinkingBudgets: {},
    },
};

/**
 * Busca la configuración de un modelo por su nombre exacto.
 * Retorna undefined si el modelo no está en el registro.
 */
export function getModelConfig(modelName: string): ModelConfig | undefined {
    return MODEL_REGISTRY[modelName.toLowerCase()];
}

/**
 * Retorna el ID del SVG symbol correspondiente al proveedor del modelo.
 */
export function getProviderIconId(modelName: string): string | null {
    const config = getModelConfig(modelName);
    if (!config) return null;
    switch (config.provider) {
        case 'google':
            return 'icon-google';
        case 'anthropic':
            return 'icon-anthropic';
        case 'openai':
            return 'icon-openai';
        default:
            return null;
    }
}

