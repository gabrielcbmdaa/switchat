import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AppNotice from './AppNotice';
import { NOTICE_DURATION_MS, useNotice } from './useNotice';

function NoticeHost() {
    const { notice, noticeToken, showNotice, dismissNotice } = useNotice();
    return (
        <>
            <button type="button" onClick={() => showNotice('Could not save.')}>
                Show
            </button>
            <AppNotice notice={notice} noticeToken={noticeToken} onDismiss={dismissNotice} />
        </>
    );
}

describe('AppNotice', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows the sentence and clears it after five seconds', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<NoticeHost />);

        await user.click(screen.getByRole('button', { name: 'Show' }));

        expect(screen.getByRole('status')).toHaveTextContent('Could not save.');

        await act(async () => { vi.advanceTimersByTime(NOTICE_DURATION_MS); });

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('clears the notice when Dismiss notice is pressed', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<NoticeHost />);

        await user.click(screen.getByRole('button', { name: 'Show' }));
        expect(screen.getByRole('status')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not let a dismissed notice timer clear a later one', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<NoticeHost />);

        await user.click(screen.getByRole('button', { name: 'Show' }));
        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => { vi.advanceTimersByTime(2000); });
        await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));

        await user.click(screen.getByRole('button', { name: 'Show' }));
        expect(screen.getByRole('status')).toHaveTextContent('Could not save.');

        // The first notice's five seconds elapse here. If dismiss left that timer
        // running, it would take this second notice down with it.
        await act(async () => { vi.advanceTimersByTime(3000); });

        expect(screen.getByRole('status')).toHaveTextContent('Could not save.');
    });

    it('restarts the notice timer bar when the same sentence is shown again', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<NoticeHost />);

        await user.click(screen.getByRole('button', { name: 'Show' }));

        const firstToken = document.querySelector('.app-notice-timer')?.getAttribute('data-notice-token');
        expect(firstToken).toBeTruthy();
        const firstStatus = screen.getByRole('status');

        await act(async () => { vi.advanceTimersByTime(2000); });

        await user.click(screen.getByRole('button', { name: 'Show' }));

        const secondToken = document.querySelector('.app-notice-timer')?.getAttribute('data-notice-token');
        expect(Number(secondToken)).toBeGreaterThan(Number(firstToken));
        expect(screen.getByRole('status')).not.toBe(firstStatus);

        // Two seconds of the first five already elapsed. If showNotice did not
        // clear that timer, the pill would vanish after these three seconds.
        await act(async () => { vi.advanceTimersByTime(3000); });
        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => { vi.advanceTimersByTime(2000); });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
