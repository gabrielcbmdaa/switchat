import { fetchApiKeysFromServer, replaceApiKeysOnServer } from '../services/api';
import type { RemoteApiKey } from '../services/api';

// AccountView guarda la lista completa en 'savedApiKeys' con el proveedor capitalizado, y
// aparte la key ACTIVA de cada proveedor en su propia entrada. Hay que respetar las dos
// cosas: escribir el proveedor en minúsculas rompería el control de duplicados de
// saveKeyWithProvider, que compara con === y espera 'Google', no 'google'.
const SAVED_KEYS_STORAGE = 'savedApiKeys';

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
    google: 'Google',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
};

const ACTIVE_KEY_STORAGE: Record<string, string> = {
    google: 'geminiApiKey',
    anthropic: 'anthropicApiKey',
    openai: 'openaiApiKey',
};

// Internamente el proveedor va siempre en minúsculas, como en el servidor y en MODEL_REGISTRY
export type ApiKeyEntry = RemoteApiKey;

const identityOf = (entry: ApiKeyEntry) => `${entry.provider}::${entry.key}`;

/**
 * Lee las API keys de localStorage y marca cuál está activa por proveedor.
 */
export function loadLocalApiKeys(): ApiKeyEntry[] {
    let saved: unknown;
    try {
        saved = JSON.parse(localStorage.getItem(SAVED_KEYS_STORAGE) || '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(saved)) return [];

    return saved
        .filter((item): item is { key: string; provider: string } =>
            Boolean(item) && typeof item.key === 'string' && typeof item.provider === 'string' && item.key.trim() !== ''
        )
        .map((item) => {
            const provider = item.provider.toLowerCase();
            const activeStorageKey = ACTIVE_KEY_STORAGE[provider];
            const activeKey = activeStorageKey ? localStorage.getItem(activeStorageKey) : null;
            return { provider, key: item.key, isActive: activeKey === item.key };
        });
}

/**
 * Escribe la lista en localStorage en el formato que espera AccountView.
 */
export function saveLocalApiKeys(entries: ApiKeyEntry[]): void {
    const list = entries.map((entry) => ({
        key: entry.key,
        provider: PROVIDER_DISPLAY_NAMES[entry.provider] || entry.provider,
    }));
    localStorage.setItem(SAVED_KEYS_STORAGE, JSON.stringify(list));

    // Se reescriben TODAS las entradas de key activa, no solo las que tienen una. Si un
    // proveedor se queda sin activa y no lo limpiamos, seguiría apuntando a una key que
    // ya no está en la lista y los proveedores la usarían igualmente.
    for (const [provider, storageKey] of Object.entries(ACTIVE_KEY_STORAGE)) {
        const active = entries.find((entry) => entry.provider === provider && entry.isActive);
        localStorage.setItem(storageKey, active ? active.key : '');
    }
}

/**
 * Funde lo local con lo de la cuenta.
 *
 * Ninguna key se pierde: el resultado es la unión de las dos listas, porque todas son
 * claves que el usuario guardó a conciencia en algún dispositivo. Donde el servidor manda
 * es en CUÁL queda activa por proveedor, y por eso entra primero.
 *
 * El orden importa. Al revés —subir primero y bajar lo que falte— el cliente gana siempre,
 * y entonces iniciar sesión en un dispositivo viejo, con una key rotada hace meses todavía
 * en localStorage, la marcaría como activa en todos los demás. Iniciar sesión debe ser
 * "este dispositivo se adhiere a la cuenta", nunca una escritura destructiva.
 */
export function reconcileApiKeys(local: ApiKeyEntry[], remote: ApiKeyEntry[]): ApiKeyEntry[] {
    const merged: ApiKeyEntry[] = [];
    const seen = new Set<string>();

    for (const entry of remote) {
        if (seen.has(identityOf(entry))) continue;
        seen.add(identityOf(entry));
        merged.push({ ...entry });
    }

    for (const entry of local) {
        if (seen.has(identityOf(entry))) continue;
        seen.add(identityOf(entry));
        // Solo puede haber una activa por proveedor (el servidor lo impone con un índice
        // parcial): si la cuenta ya trae una, la local sube guardada pero inactiva.
        const providerAlreadyActive = merged.some((item) => item.provider === entry.provider && item.isActive);
        merged.push({ ...entry, isActive: entry.isActive && !providerAlreadyActive });
    }

    return merged;
}

/**
 * Reconcilia las API keys locales con las de la cuenta. Se llama al iniciar sesión y al
 * reatachar una sesión existente al arrancar.
 *
 * Nunca lanza: fallar sincronizando claves no puede impedirte entrar en la aplicación.
 */
export async function syncApiKeysWithServer(): Promise<void> {
    try {
        const remote = await fetchApiKeysFromServer();

        // null es "no se pudo leer", que no es lo mismo que "la cuenta no tiene ninguna".
        // Confundirlos borraría las keys locales la primera vez que el servidor fallara.
        if (remote === null) return;

        const merged = reconcileApiKeys(loadLocalApiKeys(), remote);
        saveLocalApiKeys(merged);
        await replaceApiKeysOnServer(merged);

    } catch (error) {
        console.warn('⚠️ Error [syncApiKeysWithServer]:', (error as Error).message);
    }
}
