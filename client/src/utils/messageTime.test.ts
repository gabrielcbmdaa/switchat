import { describe, it, expect } from 'vitest';
import { formatMessageTime } from './messageTime';

// A fixed clock, so the ladder is measured against a date that never moves. Local time on
// purpose: the function compares calendar days with getDate(), which is local too.
const NOW = new Date(2026, 7, 21, 14, 30, 0); // 21/08/2026, 14:30

function ago(ms: number): string {
    return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('formatMessageTime', () => {
    it('reads a message from a few seconds ago as just sent', () => {
        expect(formatMessageTime(ago(5 * SECOND), NOW)).toBe('just now');
    });

    it('counts the minutes below the hour', () => {
        expect(formatMessageTime(ago(12 * MINUTE), NOW)).toBe('12m ago');
    });

    it('counts the hours below the day', () => {
        expect(formatMessageTime(ago(3 * HOUR), NOW)).toBe('3h ago');
    });

    it('names the previous calendar day', () => {
        expect(formatMessageTime(ago(26 * HOUR), NOW)).toBe('yesterday');
    });

    it('falls back to the calendar date once the message is older', () => {
        expect(formatMessageTime(ago(3 * 24 * HOUR), NOW)).toBe('18/08/2026');
    });

    // The two sides of the first step, which is the one that rounds.
    it('stays on just now at 59 seconds and turns over at 60', () => {
        expect(formatMessageTime(ago(59 * SECOND), NOW)).toBe('just now');
        expect(formatMessageTime(ago(MINUTE), NOW)).toBe('1m ago');
    });

    // The case that dictates the order of the ladder: 'yesterday' has to sit below the 24h
    // cut, or a message two hours old would claim to be from the day before.
    it('reports a late-night message read after midnight in hours, not as yesterday', () => {
        const afterMidnight = new Date(2026, 7, 21, 1, 0, 0);  // 21/08 at 01:00
        const lateLastNight = new Date(2026, 7, 20, 23, 0, 0); // 20/08 at 23:00

        expect(formatMessageTime(lateLastNight.toISOString(), afterMidnight)).toBe('2h ago');
    });

    // Messages stored before the field existed. An empty string is what tells the caller to
    // render no label at all, instead of printing 'NaNm ago'.
    it('returns nothing for a date it cannot parse', () => {
        expect(formatMessageTime('not a date', NOW)).toBe('');
        expect(formatMessageTime('', NOW)).toBe('');
    });
});
