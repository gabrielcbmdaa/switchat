import { describe, it, expect, beforeEach } from 'vitest';
import type { Message } from '../types';
import {
    NOTES_DISABLED_INSTRUCTION,
    NOTES_INSTRUCTION,
    buildNotesSystemText,
    composeProviderHistory,
    isNotesEnabled,
} from './notesContext';
import { NOTES_STORAGE_KEY, getNotesText } from './storage';

function user(text: string): Message {
    return { role: 'user', parts: [{ text }] };
}

const history: Message[] = [user('what did I write about the project?')];

describe('isNotesEnabled', () => {
    it('treats missing and false as off, unlike the system-prompt switch', () => {
        expect(isNotesEnabled(undefined)).toBe(false);
        expect(isNotesEnabled(false)).toBe(false);
        expect(isNotesEnabled(true)).toBe(true);
    });
});

describe('buildNotesSystemText', () => {
    it('returns nothing when the notebook is empty or whitespace', () => {
        expect(buildNotesSystemText('')).toBeUndefined();
        expect(buildNotesSystemText('   \n')).toBeUndefined();
    });

    it('wraps the raw notebook so the model does not treat it as instructions', () => {
        const text = buildNotesSystemText('ship the notes reader first');
        expect(text).toContain(NOTES_INSTRUCTION);
        expect(text).toContain('<user_notes>\nship the notes reader first\n</user_notes>');
    });
});

describe('composeProviderHistory', () => {
    it('leaves history unchanged when there is no system prompt and no notes', () => {
        const result = composeProviderHistory(history);
        expect(result).toEqual(history);
        expect(result).not.toBe(history);
    });

    it('packs system prompt, then notes, then history', () => {
        const result = composeProviderHistory(history, 'be brief', 'ship the notes reader first');
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ role: 'system', parts: [{ text: 'be brief' }] });
        expect(result[1].role).toBe('system');
        expect(result[1].parts[0].text).toContain('ship the notes reader first');
        expect(result[2]).toEqual(history[0]);
    });

    it('omits the notes block when the notebook is blank, even if a string was passed', () => {
        const result = composeProviderHistory(history, 'be brief', '  ');
        expect(result).toHaveLength(2);
        expect(result[0].parts[0].text).toBe('be brief');
        expect(result[1]).toEqual(history[0]);
    });

    it('omits an empty system prompt but still attaches notes', () => {
        const result = composeProviderHistory(history, '  ', 'only notes');
        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('system');
        expect(result[0].parts[0].text).toContain('only notes');
        expect(result[1]).toEqual(history[0]);
    });

    it('when the switch is off, tells the model how to turn notes on and never sends the notebook', () => {
        const result = composeProviderHistory(
            history,
            undefined,
            'ship the notes reader first',
            false
        );

        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('system');
        expect(result[0].parts[0].text).toContain(NOTES_DISABLED_INSTRUCTION);
        expect(result[0].parts[0].text).not.toContain('ship the notes reader first');
        expect(result[1]).toEqual(history[0]);
    });

    it('when the switch is on, does not tell the model to turn notes on', () => {
        const result = composeProviderHistory(history, undefined, 'ship the notes reader first', true);

        expect(result[0].parts[0].text).toContain('ship the notes reader first');
        expect(result[0].parts[0].text).not.toContain(NOTES_DISABLED_INSTRUCTION);
    });
});

describe('getNotesText', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('reads the trimmed notebook from the existing storage key', () => {
        localStorage.setItem(NOTES_STORAGE_KEY, '  hello notes  ');
        expect(getNotesText()).toBe('hello notes');
    });

    it('returns an empty string when nothing is stored', () => {
        expect(getNotesText()).toBe('');
    });
});
