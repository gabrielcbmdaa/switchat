import { fetchApiKeysFromServer, replaceApiKeysOnServer } from '../services/api';
import type { RemoteApiKey } from '../services/api';

// AccountView guarda la lista completa en 'savedApiKeys' con el proveedor capitalizado, y
// aparte la key ACTIVA de cada proveedor en su propia entrada. Hay que respetar las dos
// cosas: escribir el proveedor en minúsculas rompería el control de duplicados de
// saveKeyWithProvider, que compara con === y espera 'Google', no 'google'.
const SAVED_KEYS_STORAGE = 'savedApiKeys';

// Foto de lo que tenía la cuenta la última vez que este navegador miró. Es la tercera
// lista que hace falta para poder distinguir una clave nueva de aquí de una que borraron
// en otro dispositivo: con solo local y servidor, ambas se ven igual.
//
// Se guarda la entrada completa y no solo la identidad porque también hay que recordar
// CUÁL tenía el punto de activa en la cuenta, para no pisarlo desde un dispositivo donde
// el punto lo tiene una clave que solo vive aquí.
const ACCOUNT_SNAPSHOT_STORAGE = 'apiKeysLastSynced';

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
 * Lee la foto de la cuenta que este navegador guardó la última vez que sincronizó.
 * Vacío significa "nunca sincronizado", y entonces nada se considera borrado.
 */
export function loadAccountSnapshot(): ApiKeyEntry[] {
    try {
        const raw = JSON.parse(localStorage.getItem(ACCOUNT_SNAPSHOT_STORAGE) || '[]');
        if (!Array.isArray(raw)) return [];

        return raw
            .filter((item): item is ApiKeyEntry =>
                Boolean(item) && typeof item.provider === 'string' && typeof item.key === 'string'
            )
            .map((item) => ({ provider: item.provider, key: item.key, isActive: item.isActive === true }));
    } catch {
        return [];
    }
}

export function accountIdentities(snapshot: ApiKeyEntry[]): Set<string> {
    return new Set(snapshot.map(identityOf));
}

function saveAccountSnapshot(entries: ApiKeyEntry[]): void {
    localStorage.setItem(ACCOUNT_SNAPSHOT_STORAGE, JSON.stringify(entries));
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
 * Funde lo local con lo de la cuenta, a tres bandas.
 *
 * Una clave que está en local pero no en la cuenta es ambigua: puede ser nueva de este
 * navegador, o puede que la borraran en otro dispositivo. La foto de la cuenta deshace el
 * empate. Si estaba sincronizada y ya no está, es un borrado y se acata; si nunca lo
 * estuvo, es nueva y se queda. Sin esta tercera lista, un borrado nunca se propaga: el
 * navegador que aún la tiene la vuelve a subir en cuanto sincroniza.
 *
 * Nada más se pierde. Donde el servidor manda es en CUÁL queda activa por proveedor, y
 * por eso entra primero. Al revés —subir primero y bajar lo que falte— el cliente ganaría
 * siempre, y entrar desde un dispositivo viejo, con una clave rotada hace meses todavía en
 * localStorage, la impondría como activa en todos los demás. Iniciar sesión debe ser
 * "este dispositivo se adhiere a la cuenta", nunca una escritura destructiva.
 */
export function reconcileApiKeys(
    local: ApiKeyEntry[],
    remote: ApiKeyEntry[],
    lastSeenInAccount: Set<string>
): ApiKeyEntry[] {
    const merged: ApiKeyEntry[] = [];
    const seen = new Set<string>();

    for (const entry of remote) {
        if (seen.has(identityOf(entry))) continue;
        seen.add(identityOf(entry));
        merged.push({ ...entry });
    }

    for (const entry of local) {
        const identity = identityOf(entry);
        if (seen.has(identity)) continue;

        // Estaba sincronizada y ha desaparecido de la cuenta: la borraron en otro sitio.
        if (lastSeenInAccount.has(identity)) continue;

        seen.add(identity);
        // Solo puede haber una activa por proveedor (el servidor lo impone con un índice
        // parcial): si la cuenta ya trae una, la local sube guardada pero inactiva.
        const providerAlreadyActive = merged.some((item) => item.provider === entry.provider && item.isActive);
        merged.push({ ...entry, isActive: entry.isActive && !providerAlreadyActive });
    }

    return merged;
}

// AccountView lee localStorage solo al montarse, así que una sincronización de fondo no
// se vería hasta cambiar de vista y volver. Este evento le avisa de que se releía.
export const API_KEYS_SYNCED_EVENT = 'switchat:apikeys-synced';

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

        const merged = reconcileApiKeys(loadLocalApiKeys(), remote, accountIdentities(loadAccountSnapshot()));
        saveLocalApiKeys(merged);
        saveAccountSnapshot(merged);
        window.dispatchEvent(new CustomEvent(API_KEYS_SYNCED_EVENT));

        await replaceApiKeysOnServer(merged);

    } catch (error) {
        console.warn('⚠️ Error [syncApiKeysWithServer]:', (error as Error).message);
    }
}

/**
 * Sube el estado local actual a la cuenta tras un cambio hecho por el usuario.
 *
 * Lee de localStorage en vez de recibir la lista por parámetro a propósito: AccountView
 * escribe ahí de forma síncrona antes de llamar, y su estado de React todavía no está
 * actualizado en ese momento.
 *
 * Es un reemplazo completo, así que también propaga los BORRADOS. Sin esto, borrar una
 * clave la dejaría viva en el servidor y el siguiente inicio de sesión la volvería a bajar.
 */
export async function pushLocalApiKeysToServer(): Promise<void> {
    try {
        const entries = loadLocalApiKeys();
        const stored = await replaceApiKeysOnServer(entries);

        // Solo si la subida cuajó: anotar como sincronizado algo que no llegó haría que la
        // próxima reconciliación lo interpretase como un borrado ajeno y lo eliminara.
        if (stored) saveAccountSnapshot(entries);

    } catch (error) {
        console.warn('⚠️ Error [pushLocalApiKeysToServer]:', (error as Error).message);
    }
}
