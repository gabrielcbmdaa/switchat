import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AccountView from './AccountView';

const api = vi.hoisted(() => ({
    loginOrRegister: vi.fn(),
    checkSession: vi.fn(),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
    deleteAccountFromServer: vi.fn(),
}));

vi.mock('../services/api', () => ({ ...api, API_BACKEND_URL: '/api' }));

function renderAccount(isAuthenticated = false) {
    const onNotice = vi.fn<(message: string) => void>();
    render(
        <AccountView
            isAuthenticated={isAuthenticated}
            onAuthSuccess={() => { }}
            onLogoutAction={() => { }}
            onOpenTerms={() => { }}
            onNotice={onNotice}
        />
    );
    return { onNotice };
}

beforeEach(() => {
    vi.clearAllMocks();
    api.checkSession.mockResolvedValue({ authenticated: false });
});

describe('AccountView notices', () => {
    it('reports a failed login', async () => {
        api.loginOrRegister.mockRejectedValue(new Error('Invalid credentials'));
        const { onNotice } = renderAccount();

        await userEvent.type(screen.getByPlaceholderText('Your email'), 'user@example.com');
        await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong-password');
        await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

        expect(onNotice).toHaveBeenCalledWith('Error: Invalid credentials');
    });

    it('reports a successful email update', async () => {
        api.checkSession.mockResolvedValue({ authenticated: true, email: 'old@example.com' });
        api.updateEmail.mockResolvedValue({ email: 'new@example.com' });
        const { onNotice } = renderAccount(true);

        await userEvent.type(screen.getByPlaceholderText('New email'), 'new@example.com');
        await userEvent.type(screen.getAllByPlaceholderText('Password')[0], 'current-password');
        await userEvent.click(screen.getByTitle('Update email'));

        expect(onNotice).toHaveBeenCalledWith('Email updated successfully');
    });
});
