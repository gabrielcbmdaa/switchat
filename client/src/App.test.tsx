import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from './types';
import App from './App';

// The whole server boundary lives in services/api, so mocking that one module is enough to
// run the app offline of everything: App.tsx imports even fetchChatResponse from here.
const api = vi.hoisted(() => ({
    checkSession: vi.fn(),
    loadChatsFromServer: vi.fn(),
    fetchChatMessagesFromServer: vi.fn(),
    fetchChatResponse: vi.fn(),
    saveMessageToServer: vi.fn(),
    saveChatToServer: vi.fn(),
    syncChatDraftToServer: vi.fn(),
    deleteChatFromServer: vi.fn(),
    deleteMessageFromServer: vi.fn(),
    generateChatTitle: vi.fn(),
    logoutFromServer: vi.fn(),
    fetchApiKeysFromServer: vi.fn(),
    replaceApiKeysOnServer: vi.fn(),
}));

vi.mock('./services/api', () => ({ ...api, API_BACKEND_URL: '/api' }));

function message(role: 'user' | 'model', text: string, minute: number): Message {
    return {
        _id: `id-${text}`,
        role,
        parts: [{ text }],
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString(),
    };
}

// Six messages: exactly one page, so hasMoreMap is never marked for this chat.
const messagesA: Message[] = [
    message('user', 'A question 1', 1),
    message('model', 'A answer 1', 2),
    message('user', 'A question 2', 3),
    message('model', 'A answer 2', 4),
    message('user', 'A question 3', 5),
    message('model', 'A answer 3', 6),
];

// Three: below the page size, which is what makes the server report "nothing older left".
const messagesB: Message[] = [
    message('user', 'B question 1', 7),
    message('model', 'B answer 1', 8),
    message('user', 'B question 2', 9),
];

/** A promise the test resolves by hand, to hold the model mid-answer. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
}

beforeEach(() => {
    vi.clearAllMocks();
    api.checkSession.mockResolvedValue({ authenticated: true, userId: 'user-1' });
    api.loadChatsFromServer.mockResolvedValue([
        { id: 'chat-a', title: 'Chat A', draft: '', messages: [], model: 'gemini-3.5-flash' },
        { id: 'chat-b', title: 'Chat B', draft: '', messages: [], model: 'gemini-3.5-flash' },
    ]);
    api.fetchChatMessagesFromServer.mockImplementation(async (chatId: string) =>
        chatId === 'chat-a' ? messagesA : messagesB
    );
    api.saveMessageToServer.mockResolvedValue('saved-id');
    api.saveChatToServer.mockResolvedValue(true);
    api.syncChatDraftToServer.mockResolvedValue(true);
    api.generateChatTitle.mockResolvedValue('');
    api.fetchApiKeysFromServer.mockResolvedValue(null);
});

describe('switching chats while the model is answering', () => {
    it('keeps the messages of the chat you switched to', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);

        // Chat A is the active one on load, and its first page arrives lazily.
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'a new prompt');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        // Leave A mid-answer and open B, whose messages load while we wait.
        await userEvent.click(screen.getByText('Chat B'));
        await screen.findByText('B question 1');

        await act(async () => {
            answer.resolve({ text: 'the model answer' });
        });

        // The answer landed in the chat that asked for it...
        await userEvent.click(screen.getByText('Chat A'));
        await screen.findByText('the model answer');

        // ...and it did not take the rest of the list with it. Before the fix, writing the
        // whole list from a pre-request snapshot emptied B, and the lazy load never
        // retried it because a chat under one page long is marked as fully loaded.
        await userEvent.click(screen.getByText('Chat B'));
        expect(screen.getByText('B question 1')).toBeInTheDocument();
        expect(screen.getByText('B answer 1')).toBeInTheDocument();
        expect(screen.getByText('B question 2')).toBeInTheDocument();
    });
});
