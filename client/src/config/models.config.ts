// ============================================================
// Registro estático de modelos y sus capacidades de thinking.
// Fuente: https://ai.google.dev/gemini-api/docs/thinking
// ============================================================

/**
 * How a model expects the thinking knob to be sent. Only the Anthropic client reads it,
 * because Anthropic changed that shape mid-generation and both forms are still live:
 *
 * - 'budget': `thinking: {type:'enabled', budget_tokens: N}`. The old form. Still the ONLY
 *   one the pre-4.6 models accept, so it cannot simply be deleted.
 * - 'effort': `thinking: {type:'adaptive'}` plus `output_config.effort`. The models that use
 *   it answer 400 to `budget_tokens`, which is what this field exists to prevent.
 * - 'always-on': same as 'effort' but thinking cannot be turned off; ANY explicit `thinking`
 *   is a 400, including `{type:'disabled'}`, so the field is left out of the request.
 */
export type ThinkingApi = 'budget' | 'effort' | 'always-on';

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
    /** Anthropic only: request shape for the thinking knob. Defaults to 'budget'. */
    thinkingApi?: ThinkingApi;
}

/**
 * Diccionario de modelos conocidos con su configuración de thinking.
 * Los nombres deben coincidir con los IDs que el usuario escribe en el input de modelo.
 */
export const MODEL_REGISTRY: Record<string, ModelConfig> = {
    // ── Google Gemini 3.x ──────────────────────────────────
    'gemini-3.6-flash': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3.5-flash': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3.5-flash-lite': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'minimal',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3.1-pro-preview': {
        thinkingLevels: ['low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'google',
        thinkingBudgets: {},
    },
    'gemini-3.1-flash-lite': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'minimal',
        provider: 'google',
        thinkingBudgets: {},
    },

    // ── Anthropic Claude ─────────────────────────────────────
    'claude-fable-5': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'anthropic',
        // Empty on purpose: this model bills thinking by effort, not by a token budget.
        thinkingBudgets: {},
        thinkingApi: 'always-on',
    },
    'claude-opus-4-8': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'anthropic',
        thinkingBudgets: {},
        thinkingApi: 'effort',
    },
    'claude-sonnet-5': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'high',
        provider: 'anthropic',
        thinkingBudgets: {},
        thinkingApi: 'effort',
    },
    // The only Anthropic model here still on the old shape: it has no effort parameter,
    // so budget_tokens is not legacy leftovers, it is the only thing it accepts.
    'claude-haiku-4-5': {
        thinkingLevels: ['minimal', 'low', 'medium', 'high'],
        defaultThinking: 'medium',
        provider: 'anthropic',
        thinkingApi: 'budget',
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
        thinkingLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
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
};

/**
 * Modelos que estuvieron en el registro y ya no.
 *
 * Hace falta la lista aparte porque borrarlos no basta: los chats guardados siguen
 * apuntando a ellos. Y no vale con migrar "todo lo que el registro no conozca" — los ids
 * de LM Studio y Ollama se escriben a mano y nunca están aquí, así que esa regla le
 * cambiaría al usuario sus modelos locales. Esta lista dice "esto lo quitamos nosotros",
 * que no es lo mismo que "esto no lo conocemos".
 */
export const RETIRED_MODELS: readonly string[] = ['gemini-2.5-pro', 'gemini-2.5-flash'];

export function isRetiredModel(modelName: string): boolean {
    return RETIRED_MODELS.includes(modelName.toLowerCase());
}

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

