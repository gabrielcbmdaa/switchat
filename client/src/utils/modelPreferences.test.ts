import { describe, it, expect, beforeEach } from 'vitest';
import { migrateRetiredModels, saveDefaultModel, loadDefaultModel, DEFAULT_MODEL } from './modelPreferences';
import type { Chat } from '../types';

function chat(id: string, model?: string): Chat {
    return { id, title: id, draft: '', messages: [], model };
}

beforeEach(() => {
    localStorage.clear();
});

describe('migrateRetiredModels', () => {
    it('cambia un modelo retirado por el último que el usuario eligió', () => {
        saveDefaultModel('claude-sonnet-5');

        const [migrated] = migrateRetiredModels([chat('a', 'gemini-2.5-flash')]);

        expect(migrated.model).toBe('claude-sonnet-5');
    });

    it('cae al modelo por defecto cuando no hay preferencia guardada', () => {
        const [migrated] = migrateRetiredModels([chat('a', 'gemini-2.5-pro')]);

        expect(migrated.model).toBe(DEFAULT_MODEL);
    });

    it('se cura sola si la propia preferencia global era un modelo retirado', () => {
        // loadDefaultModel descarta lo que no esté en el registro, y los 2.5 ya no están.
        saveDefaultModel('gemini-2.5-flash');

        const [migrated] = migrateRetiredModels([chat('a', 'gemini-2.5-flash')]);

        expect(loadDefaultModel()).toBe(DEFAULT_MODEL);
        expect(migrated.model).toBe(DEFAULT_MODEL);
    });

    it('no toca un id escrito a mano: LM Studio y Ollama nunca están en el registro', () => {
        const [migrated] = migrateRetiredModels([chat('a', 'llama-3.1-8b-instruct')]);

        expect(migrated.model).toBe('llama-3.1-8b-instruct');
    });

    it('no toca un modelo vigente ni un chat sin modelo', () => {
        const [vigente, sinModelo] = migrateRetiredModels([
            chat('a', 'gemini-3.5-flash'),
            chat('b'),
        ]);

        expect(vigente.model).toBe('gemini-3.5-flash');
        expect(sinModelo.model).toBeUndefined();
    });

    it('devuelve el mismo array si no hay nada que migrar, para no repintar de balde', () => {
        const chats = [chat('a', 'gemini-3.5-flash')];

        expect(migrateRetiredModels(chats)).toBe(chats);
    });
});
