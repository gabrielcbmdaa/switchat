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
    // A test that installs a fake clock and then fails would leave it installed for
    // everyone after it. Starting each test on the real one costs nothing and makes that
    // impossible.
    vi.useRealTimers();
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

    it('asks for the first page once, however much the list changes while it travels', async () => {
        const page = deferred<Message[]>();
        api.fetchChatMessagesFromServer.mockReturnValue(page.promise);

        render(<App />);
        await screen.findByPlaceholderText('Write a message...');

        // The lazy-load effect depends on chatList, and every keystroke rewrites the draft
        // inside it. Nothing marks the chat as loaded until the server answers, so without
        // an in-flight guard this fires one request per character.
        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'abcde');

        expect(api.fetchChatMessagesFromServer).toHaveBeenCalledTimes(1);

        await act(async () => { page.resolve(messagesA); });
        await screen.findByText('A question 1');
    });

    it('offers to send in the other chat instead of stopping the one left behind', async () => {
        const answerA = deferred<{ text: string }>();
        const answerB = deferred<{ text: string }>();
        api.fetchChatResponse
            .mockReturnValueOnce(answerA.promise)
            .mockReturnValueOnce(answerB.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'ask A');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        await userEvent.click(screen.getByText('Chat B'));
        await screen.findByText('B question 1');

        // B is not the chat that is generating, so its button must not claim otherwise.
        expect(screen.queryByTitle('Stop generating')).not.toBeInTheDocument();

        // And it takes a prompt of its own while A is still thinking.
        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'ask B');
        await userEvent.click(screen.getByTitle('Send message'));

        await act(async () => {
            answerB.resolve({ text: 'the B answer' });
            answerA.resolve({ text: 'the A answer' });
        });

        // Each answer went home: no crossing over.
        await screen.findByText('the B answer');
        expect(screen.queryByText('the A answer')).not.toBeInTheDocument();

        await userEvent.click(screen.getByText('Chat A'));
        await screen.findByText('the A answer');
        expect(screen.queryByText('the B answer')).not.toBeInTheDocument();
    });
});

describe('a failed generation', () => {
    it('shows the error for five seconds and then clears it, keeping the question', async () => {
        // The fake clock has to be installed BEFORE the app schedules anything. Vitest only
        // captures timers created after useFakeTimers runs, so setting it up later leaves
        // the removal timer on the real clock and advancing moves a clock with nothing on
        // it — the error would just sit there. shouldAdvanceTime keeps time flowing by
        // itself, which is what lets the awaits below still resolve.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        api.fetchChatResponse.mockRejectedValue(new Error('429 quota exceeded'));

        render(<App />);
        await screen.findByText('A question 1');

        await user.type(screen.getByPlaceholderText('Write a message...'), 'a doomed prompt');
        await user.click(screen.getByTitle('Send message'));

        await screen.findByText('Error: 429 quota exceeded');

        await act(async () => { vi.advanceTimersByTime(5000); });

        expect(screen.queryByText('Error: 429 quota exceeded')).not.toBeInTheDocument();
        // Only the failed answer is temporary. The question stays, ready to be retried.
        expect(screen.getByText('a doomed prompt')).toBeInTheDocument();
    });
});

describe('a chat that can read notes', () => {
    it('sends the notebook to the model without painting it in the transcript', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);
        localStorage.setItem('switchat_notes', 'ship the notes reader first');

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getByRole('switch', { name: 'Notes' }));
        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'what did I write about the project?');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        expect(api.fetchChatResponse).toHaveBeenCalled();
        const args = api.fetchChatResponse.mock.calls[0];
        expect(args[5]).toBe('ship the notes reader first');
        expect(args[0].some((message: Message) =>
            (message.parts?.[0]?.text || '').includes('ship the notes reader first')
        )).toBe(false);

        await act(async () => {
            answer.resolve({ text: 'you wrote: ship the notes reader first' });
        });

        expect(screen.queryByText('ship the notes reader first')).not.toBeInTheDocument();
        expect(screen.getByText('what did I write about the project?')).toBeInTheDocument();
    });

    it('does not send the notebook when the switch is off', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);
        localStorage.setItem('switchat_notes', 'ship the notes reader first');

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'hello');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        const args = api.fetchChatResponse.mock.calls[0];
        expect(args[5]).toBeUndefined();

        await act(async () => {
            answer.resolve({ text: 'hi' });
        });
    });
});
