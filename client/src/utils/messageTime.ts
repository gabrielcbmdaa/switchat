// How a message reports its age in the action row of MessageBubble.
//
// The ladder is deliberately hybrid: while the message is recent, "how long ago" is what a
// reader actually wants; once it is old, the elapsed time stops meaning anything and the
// calendar date is the useful answer.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Fixed on purpose instead of following the browser locale. Everything written in this
// repository is English (see AGENTS.md), and the system locale would slip Spanish month
// names into the UI on a Spanish machine. 'en-GB' is the one that renders 21/08/2026.
const LOCALE = 'en-GB';

function isPreviousCalendarDay(date: Date, now: Date): boolean {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    return date.getFullYear() === yesterday.getFullYear()
        && date.getMonth() === yesterday.getMonth()
        && date.getDate() === yesterday.getDate();
}

/**
 * Turns a message's ISO timestamp into the label shown next to its actions.
 *
 * Returns '' for anything unparseable, which is the caller's signal to render no label at
 * all: a message stored before the field existed has no date, and 'NaNm ago' is worse than
 * nothing. `now` is injectable so the ladder can be tested against a fixed clock.
 */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    const elapsed = now.getTime() - date.getTime();

    // A clock that runs behind the server's produces a message from the future. It is not
    // an error worth hiding the label for, and "just now" is the honest reading.
    if (elapsed < MINUTE) return 'just now';
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;

    // 'yesterday' sits BELOW the 24h cut, not above it. The other way round, a message sent
    // at 23:00 and read at 01:00 would claim to be from yesterday while being two hours old.
    // Down here the branch is only reachable between 24 and 48 hours.
    if (isPreviousCalendarDay(date, now)) return 'yesterday';

    return date.toLocaleDateString(LOCALE);
}
