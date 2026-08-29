import { render, screen, act, within, fireEvent } from '@testing-library/react';
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
    updateMessageOnServer: vi.fn(),
    generateChatTitle: vi.fn(),
    logoutFromServer: vi.fn(),
    fetchApiKeysFromServer: vi.fn(),
    replaceApiKeysOnServer: vi.fn(),
    loginOrRegister: vi.fn(),
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
    // Same story with the spies a test installs on window or console: a failure would leave
    // them in place for everyone after it. clearAllMocks empties the api mocks but does not
    // give a spied-on original back.
    vi.restoreAllMocks();
    api.checkSession.mockResolvedValue({ authenticated: true, userId: 'user-1' });
    api.loadChatsFromServer.mockResolvedValue([
        { id: 'chat-a', title: 'Chat A', draft: '', messages: [], model: 'gemini-3.5-flash' },
        { id: 'chat-b', title: 'Chat B', draft: '', messages: [], model: 'gemini-3.5-flash' },
    ]);
    api.fetchChatMessagesFromServer.mockImplementation(async (chatId: string) =>
        chatId === 'chat-a' ? messagesA : messagesB
    );
    api.saveMessageToServer.mockResolvedValue('saved-id');
    api.updateMessageOnServer.mockResolvedValue(undefined);
    api.saveChatToServer.mockResolvedValue(true);
    api.syncChatDraftToServer.mockResolvedValue(true);
    api.generateChatTitle.mockResolvedValue('');
    api.fetchApiKeysFromServer.mockResolvedValue(null);
    api.logoutFromServer.mockResolvedValue(undefined);
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

    it('warns on the prompt when the session expires mid-answer', async () => {
        api.fetchChatResponse.mockRejectedValue(new Error('SESSION_EXPIRED'));

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'a doomed prompt');
        await userEvent.click(screen.getByTitle('Send message'));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Session expired. Please log in again.'
        );
    });
});

describe('clicking Stop', () => {
    // fetchChatResponse only rejects with AbortError once its signal actually fires, the way
    // the real fetch does. Each call's resolver is kept around so a later request in the same
    // test can still be answered normally.
    function mockAbortableFetch() {
        const resolvers: Array<(value: { text: string }) => void> = [];
        api.fetchChatResponse.mockImplementation((...args: unknown[]) => {
            const signal = args[4] as AbortSignal;
            return new Promise<{ text: string }>((resolve, reject) => {
                resolvers.push(resolve);
                signal.addEventListener('abort', () => {
                    const err = new Error('The user aborted a request.');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
        });
        return resolvers;
    }

    it('flips the button back to Send right away, without waiting for the prompt to save', async () => {
        mockAbortableFetch();
        // Kept pending on purpose: the button must come back before this ever resolves.
        const savedMessageId = deferred<string>();
        api.saveMessageToServer.mockReturnValue(savedMessageId.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'a message to stop');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        await userEvent.click(screen.getByTitle('Stop generating'));

        // Before the fix this hung until saveMessageToServer resolved: the catch block
        // awaited it ahead of the finally that releases the button.
        await screen.findByTitle('Send message');

        await act(async () => { savedMessageId.resolve('sealed-id'); });
    });

    it('seals the stopped prompt in the background without wiping a message sent right after', async () => {
        const resolvers = mockAbortableFetch();
        const savedMessageId = deferred<string>();
        api.saveMessageToServer
            .mockReturnValueOnce(savedMessageId.promise)
            .mockResolvedValue('id-2');

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'first prompt');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        await userEvent.click(screen.getByTitle('Stop generating'));
        await screen.findByTitle('Send message');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'second prompt');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('second prompt');

        // The aborted prompt's save lands only now: sealing its _id must not overwrite the
        // second prompt that was sent while it was still in flight.
        await act(async () => { savedMessageId.resolve('sealed-id'); });

        expect(screen.getByText('first prompt')).toBeInTheDocument();
        expect(screen.getByText('second prompt')).toBeInTheDocument();

        await act(async () => { resolvers[1]({ text: 'the second answer' }); });
        await screen.findByText('the second answer');
    });

    it('does not let you edit a stopped prompt until its id has landed', async () => {
        mockAbortableFetch();
        const savedMessageId = deferred<string>();
        api.saveMessageToServer.mockReturnValue(savedMessageId.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'a message to stop');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');
        await userEvent.click(screen.getByTitle('Stop generating'));
        await screen.findByTitle('Send message');

        const pending = screen.getByText('a message to stop').closest('[class*="messageWrapper"]') as HTMLElement;
        expect(within(pending).getByTitle('Edit message')).toBeDisabled();

        await act(async () => { savedMessageId.resolve('sealed-id'); });

        const sealed = screen.getByText('a message to stop').closest('[class*="messageWrapper"]') as HTMLElement;
        expect(within(sealed).getByTitle('Edit message')).not.toBeDisabled();

        await userEvent.click(within(sealed).getByTitle('Edit message'));
        await userEvent.clear(within(sealed).getByRole('textbox'));
        await userEvent.type(within(sealed).getByRole('textbox'), 'a message to stop, edited');
        await userEvent.click(within(sealed).getByTitle('Save'));

        expect(api.updateMessageOnServer).toHaveBeenCalledWith('chat-a', 'sealed-id', 'a message to stop, edited');
    });
});

describe('deleting a chat', () => {
    // The trash button carries no text, only an icon, so it is found by the icon it draws.
    // Grabbing the element once matters: the first click swaps its icon for the confirm one.
    function iconButtons(iconId: string): HTMLButtonElement[] {
        return Array.from(document.querySelectorAll('button')).filter((button) => {
            const use = button.querySelector('use');
            const href = use?.getAttribute('xlink:href') ?? use?.getAttribute('href');
            return href === `#${iconId}`;
        });
    }

    it('does not push the deleted chat back to the server when its draft sync was pending', async () => {
        // Installed before render so the debounce timer lands on the fake clock.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<App />);
        await screen.findByText('A question 1');

        // Typing arms the two-second debounce that syncs chat A's draft.
        await user.type(screen.getByPlaceholderText('Write a message...'), 'half a thought');

        const trash = iconButtons('icon-trash')[0];
        await user.click(trash); // asks for confirmation
        await user.click(trash); // deletes for real

        // The debounce fires after the chat is gone. Its closure still holds chat A, and the
        // sync route upserts, so this is the call that recreates in Mongo what was deleted.
        await act(async () => { vi.advanceTimersByTime(2000); });

        const syncedIds = api.syncChatDraftToServer.mock.calls.map((call) => call[0]?.id);
        expect(syncedIds).not.toContain('chat-a');
    });

    it('does not push the deleted chat back to the server when the tab closes right after', async () => {
        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'half a thought');

        const trash = iconButtons('icon-trash')[0];
        await userEvent.click(trash);
        await userEvent.click(trash);

        // Leaving syncs whatever chat is open. It must be the one that survived, never the
        // one just deleted: that sync upserts, and would recreate it in Mongo.
        await act(async () => { window.dispatchEvent(new Event('beforeunload')); });

        // Asserting the survivor too, so the test cannot pass by syncing nothing at all.
        const syncedIds = api.syncChatDraftToServer.mock.calls.map((call) => call[0]?.id);
        expect(syncedIds).toContain('chat-b');
        expect(syncedIds).not.toContain('chat-a');
    });
});

describe('a chat that can read notes', () => {
    beforeEach(() => {
        api.loadChatsFromServer.mockResolvedValue([
            { id: 'chat-a', title: 'Chat A', draft: '', messages: [], model: 'gemini-3.5-flash', notes: 'ship the notes reader first' },
            { id: 'chat-b', title: 'Chat B', draft: '', messages: [], model: 'gemini-3.5-flash', notes: 'from B' },
        ]);
    });

    it('sends the chat notes to the model without painting them in the transcript', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getByRole('switch', { name: 'Notes' }));
        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'what did I write about the project?');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        expect(api.fetchChatResponse).toHaveBeenCalled();
        const args = api.fetchChatResponse.mock.calls[0];
        expect(args[5]).toBe('ship the notes reader first');
        expect(args[6]).toBe(true);
        expect(args[0].some((message: Message) =>
            (message.parts?.[0]?.text || '').includes('ship the notes reader first')
        )).toBe(false);

        await act(async () => {
            answer.resolve({ text: 'you wrote: ship the notes reader first' });
        });

        expect(screen.queryByText('ship the notes reader first')).not.toBeInTheDocument();
        expect(screen.getByText('what did I write about the project?')).toBeInTheDocument();
    });

    it('does not send the notes when the switch is off', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'hello');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        const args = api.fetchChatResponse.mock.calls[0];
        expect(args[5]).toBeUndefined();
        expect(args[6]).toBe(false);

        await act(async () => {
            answer.resolve({ text: 'hi' });
        });
    });

    it('shows the notes of the chat you have open', async () => {
        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getByTitle('Notes'));
        expect(screen.getByPlaceholderText('Write your notes here...')).toHaveValue('ship the notes reader first');

        await userEvent.click(screen.getByText('Chat B'));
        await screen.findByText('B question 1');
        expect(screen.getByPlaceholderText('Write your notes here...')).toHaveValue('from B');
    });

    it('saves what you write in the notes to the server', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<App />);
        await screen.findByText('A question 1');

        await user.click(screen.getByTitle('Notes'));
        await user.type(screen.getByPlaceholderText('Write your notes here...'), ' and then the cache');

        // Notes ride the same debounce as the draft, so nothing leaves before it fires.
        await act(async () => { vi.advanceTimersByTime(2000); });

        const synced = api.syncChatDraftToServer.mock.calls.map((call) => call[0]);
        const savedChatA = synced.reverse().find((chat) => chat?.id === 'chat-a');
        expect(savedChatA?.notes).toBe('ship the notes reader first and then the cache');
    });

    it('carries the notes written in a brand new chat into the chat it becomes', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('A question 1');

        // A chat that does not exist on the server yet: nothing may be synced for it.
        await userEvent.click(screen.getByText('New Chat'));
        await userEvent.click(screen.getByTitle('Notes'));
        await userEvent.type(screen.getByPlaceholderText('Write your notes here...'), 'notes typed before the chat existed');

        expect(api.syncChatDraftToServer.mock.calls.every((call) => call[0]?.notes !== 'notes typed before the chat existed')).toBe(true);

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'first message');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        // Sending is what creates it, and the notebook has to be born with it.
        const created = api.saveChatToServer.mock.calls.at(-1);
        expect(created?.[0]?.notes).toBe('notes typed before the chat existed');
        expect(created?.[1]).toEqual({ allowCreate: true });

        await act(async () => { answer.resolve({ text: 'hello' }); });
    });

    it('keeps the notes of the chat you leave instead of the one you open', async () => {
        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getByTitle('Notes'));
        await userEvent.type(screen.getByPlaceholderText('Write your notes here...'), '!');

        // Switching flushes the pending sync. It must carry A's notebook, not B's.
        await userEvent.click(screen.getByText('Chat B'));
        await screen.findByText('B question 1');

        const synced = api.syncChatDraftToServer.mock.calls.map((call) => call[0]);
        const savedChatA = synced.reverse().find((chat) => chat?.id === 'chat-a');
        expect(savedChatA?.notes).toBe('ship the notes reader first!');
    });
});

describe('editing a sent message', () => {
    it('saves the new wording and leaves later turns in place', async () => {
        render(<App />);
        await screen.findByText('A question 2');

        const bubble = screen.getByText('A question 2').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));

        const textarea = within(bubble).getByRole('textbox');
        await userEvent.clear(textarea);
        await userEvent.type(textarea, 'A question 2 edited');
        await userEvent.click(within(bubble).getByTitle('Save'));

        expect(screen.getByText('A question 2 edited')).toBeInTheDocument();
        expect(screen.getByText('A answer 2')).toBeInTheDocument();
        expect(screen.getByText('A question 3')).toBeInTheDocument();
        expect(screen.getByText('A answer 3')).toBeInTheDocument();
        expect(api.fetchChatResponse).not.toHaveBeenCalled();
        expect(api.updateMessageOnServer).toHaveBeenCalledWith('chat-a', 'id-A question 2', 'A question 2 edited');
    });

    it('drops later turns and asks the model again', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('A question 2');

        const bubble = screen.getByText('A question 2').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));

        const textarea = within(bubble).getByRole('textbox');
        await userEvent.clear(textarea);
        await userEvent.type(textarea, 'A question 2 edited');
        await userEvent.click(within(bubble).getByTitle('Save and reply'));

        expect(screen.queryByText('A answer 2')).not.toBeInTheDocument();
        expect(screen.queryByText('A question 3')).not.toBeInTheDocument();
        expect(screen.queryByText('A answer 3')).not.toBeInTheDocument();
        await screen.findByText('Thinking...');

        expect(api.fetchChatResponse).toHaveBeenCalled();
        const history = api.fetchChatResponse.mock.calls[0][0] as Message[];
        expect(history.at(-1)?.parts[0].text).toBe('A question 2 edited');
        expect(api.saveMessageToServer).not.toHaveBeenCalledWith('chat-a', expect.objectContaining({
            sender: 'user',
            content: 'A question 2 edited',
        }));
        expect(api.updateMessageOnServer).toHaveBeenCalledWith('chat-a', 'id-A question 2', 'A question 2 edited');
        expect(api.deleteMessageFromServer).toHaveBeenCalledWith('chat-a', 'id-A answer 2');
        expect(api.deleteMessageFromServer).toHaveBeenCalledWith('chat-a', 'id-A question 3');
        expect(api.deleteMessageFromServer).toHaveBeenCalledWith('chat-a', 'id-A answer 3');

        await act(async () => {
            answer.resolve({ text: 'the new answer' });
        });
        await screen.findByText('the new answer');
    });

    it('does not open edit while that chat is generating', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'a new prompt');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        const bubble = screen.getByText('A question 3').closest('[class*="messageWrapper"]') as HTMLElement;
        expect(within(bubble).getByTitle('Edit message')).toBeDisabled();

        await act(async () => {
            answer.resolve({ text: 'later' });
        });
    });

    it('closes an open editor when that chat starts generating', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('A question 2');

        const bubble = screen.getByText('A question 2').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));
        await userEvent.clear(within(bubble).getByRole('textbox'));
        await userEvent.type(within(bubble).getByRole('textbox'), 'A question 2 edited');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'a new prompt');
        await userEvent.click(screen.getByTitle('Send message'));
        await screen.findByText('Thinking...');

        expect(screen.queryByDisplayValue('A question 2 edited')).not.toBeInTheDocument();
        expect(screen.getByText('A question 2')).toBeInTheDocument();
        expect(api.updateMessageOnServer).not.toHaveBeenCalled();

        await act(async () => {
            answer.resolve({ text: 'later' });
        });
        await screen.findByText('later');
        expect(screen.getByText('A question 2')).toBeInTheDocument();
        expect(screen.queryByText('A question 2 edited')).not.toBeInTheDocument();
    });

    it('puts the wording back and warns when the server refuses the edit', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
        api.updateMessageOnServer.mockRejectedValueOnce(new Error('the server said no'));

        render(<App />);
        await screen.findByText('A question 2');

        const bubble = screen.getByText('A question 2').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));
        await userEvent.clear(within(bubble).getByRole('textbox'));
        await userEvent.type(within(bubble).getByRole('textbox'), 'A question 2 edited');
        await userEvent.click(within(bubble).getByTitle('Save'));

        // The screen has to end up showing what Mongo still holds, not what the user typed.
        expect(await screen.findByText('A question 2')).toBeInTheDocument();
        expect(screen.queryByText('A question 2 edited')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the edit. The message was left as it was.'
        );
    });

    it('leaves the later turns alone when the server refuses a save and reply', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
        api.updateMessageOnServer.mockRejectedValueOnce(new Error('the server said no'));

        render(<App />);
        await screen.findByText('A question 2');

        const bubble = screen.getByText('A question 2').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));
        await userEvent.clear(within(bubble).getByRole('textbox'));
        await userEvent.type(within(bubble).getByRole('textbox'), 'A question 2 edited');
        await userEvent.click(within(bubble).getByTitle('Save and reply'));

        // The branch is only cut once the edit is safe: no model call, nothing deleted, and
        // the conversation exactly as it was.
        expect(api.fetchChatResponse).not.toHaveBeenCalled();
        expect(api.deleteMessageFromServer).not.toHaveBeenCalled();
        expect(screen.getByText('A question 2')).toBeInTheDocument();
        expect(screen.getByText('A answer 2')).toBeInTheDocument();
        expect(screen.getByText('A question 3')).toBeInTheDocument();
        expect(screen.getByText('A answer 3')).toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the edit. The message was left as it was.'
        );
    });
});

describe('pinning a chat', () => {
    it('does not let a pending draft sync undo the pin it just saved', async () => {
        // Installed before render so the debounce timer lands on the fake clock.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<App />);
        await screen.findByText('A question 1');

        // Typing arms the two-second debounce, whose closure holds the chat as it is NOW:
        // unpinned. The sync route writes every field it receives, so letting that snapshot
        // out after the pin would put pinned back to false in Mongo.
        await user.type(screen.getByPlaceholderText('Write a message...'), 'half a thought');

        await user.click(screen.getAllByLabelText('Pin chat')[0]);
        await act(async () => { vi.advanceTimersByTime(2000); });

        expect(api.syncChatDraftToServer).not.toHaveBeenCalled();

        // And cancelling that timer costs nothing, because the save the pin sends carries the
        // same draft. Asserting it is what separates "cancelled it" from "dropped the draft".
        const pinSaves = api.saveChatToServer.mock.calls.filter((call) => call[0]?.id === 'chat-a');
        expect(pinSaves.at(-1)?.[0]).toMatchObject({ pinned: true, draft: 'half a thought' });
    });

    it('puts the pin back and warns when the server refuses the save', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getAllByLabelText('Pin chat')[0]);
        expect(screen.getByLabelText('Unpin chat')).toBeInTheDocument();

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.queryByLabelText('Unpin chat')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('keeps a draft typed before the pin when the save fails', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'half a thought');
        await userEvent.click(screen.getAllByLabelText('Pin chat')[0]);
        expect(screen.getByLabelText('Unpin chat')).toBeInTheDocument();

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.getByPlaceholderText('Write a message...')).toHaveValue('half a thought');
        expect(screen.queryByLabelText('Unpin chat')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('reschedules the draft sync when the pin save fails', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await user.type(screen.getByPlaceholderText('Write a message...'), 'half a thought');
        await user.click(screen.getAllByLabelText('Pin chat')[0]);

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.getByPlaceholderText('Write a message...')).toHaveValue('half a thought');
        expect(screen.queryByLabelText('Unpin chat')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );

        await act(async () => { vi.advanceTimersByTime(2000); });

        expect(api.syncChatDraftToServer).toHaveBeenCalled();
        expect(api.syncChatDraftToServer.mock.calls.at(-1)?.[0]).toMatchObject({
            draft: 'half a thought',
        });
        expect(api.syncChatDraftToServer.mock.calls.at(-1)?.[0].pinned).toBeFalsy();
    });

    it('does not leave a pin on screen when pin and unpin both fail', async () => {
        const pinSave = deferred<boolean>();
        const unpinSave = deferred<boolean>();
        api.saveChatToServer
            .mockReturnValueOnce(pinSave.promise)
            .mockReturnValueOnce(unpinSave.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getAllByLabelText('Pin chat')[0]);
        expect(screen.getByLabelText('Unpin chat')).toBeInTheDocument();

        await userEvent.click(screen.getByLabelText('Unpin chat'));
        expect(screen.queryByLabelText('Unpin chat')).not.toBeInTheDocument();

        await act(async () => {
            pinSave.resolve(false);
        });
        await act(async () => {
            unpinSave.resolve(false);
        });

        expect(screen.queryByLabelText('Unpin chat')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('pins without calling the server when signed out', async () => {
        api.checkSession.mockResolvedValue({ authenticated: false });
        localStorage.setItem('chatList', JSON.stringify([{
            id: 'offline-chat',
            title: 'Offline chat',
            draft: '',
            model: 'gemini-3.5-flash',
            messages: [message('user', 'a local question', 1)],
        }]));
        localStorage.setItem('activeChatId', 'offline-chat');
        render(<App />);
        await screen.findByText('a local question');

        await userEvent.click(screen.getByLabelText('Pin chat'));

        expect(screen.getByLabelText('Unpin chat')).toBeInTheDocument();
        expect(api.saveChatToServer).not.toHaveBeenCalled();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('clears the notice after five seconds when the server refuses the pin', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await user.click(screen.getAllByLabelText('Pin chat')[0]);

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.getByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );

        await act(async () => { vi.advanceTimersByTime(5000); });

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('clears the notice when Dismiss notice is pressed', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await user.click(screen.getAllByLabelText('Pin chat')[0]);

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.getByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );

        await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not let a dismissed notice timer clear a later one', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const first = deferred<boolean>();
        const second = deferred<boolean>();
        api.saveChatToServer
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await user.click(screen.getAllByLabelText('Pin chat')[0]);
        await act(async () => {
            first.resolve(false);
        });
        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => { vi.advanceTimersByTime(2000); });
        await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));

        await user.click(screen.getAllByLabelText('Pin chat')[0]);
        await act(async () => {
            second.resolve(false);
        });
        expect(screen.getByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );

        // The first notice's five seconds elapse here. If dismiss left that timer
        // running, it would take this second notice down with it.
        await act(async () => { vi.advanceTimersByTime(3000); });

        expect(screen.getByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('restarts the notice timer bar when the same sentence is shown again', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const first = deferred<boolean>();
        const second = deferred<boolean>();
        api.saveChatToServer
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await user.click(screen.getAllByLabelText('Pin chat')[0]);
        await act(async () => {
            first.resolve(false);
        });

        const firstToken = document.querySelector('.app-notice-timer')?.getAttribute('data-notice-token');
        expect(firstToken).toBeTruthy();

        await act(async () => { vi.advanceTimersByTime(2000); });

        await user.click(screen.getAllByLabelText('Pin chat')[0]);
        await act(async () => {
            second.resolve(false);
        });

        const secondToken = document.querySelector('.app-notice-timer')?.getAttribute('data-notice-token');
        expect(Number(secondToken)).toBeGreaterThan(Number(firstToken));
    });
});

describe('renaming a chat', () => {
    it('does not let a pending draft sync undo the title it just saved', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<App />);
        await screen.findByText('A question 1');

        await user.type(screen.getByPlaceholderText('Write a message...'), 'half a thought');

        const row = screen.getByText('Chat A').closest('[class*="chatButton"]') as HTMLElement;
        await user.click(within(row).getByLabelText('Rename chat'));
        const titleInput = screen.getByDisplayValue('Chat A');
        await user.clear(titleInput);
        await user.type(titleInput, 'Renamed A');
        await user.keyboard('{Enter}');

        await act(async () => { vi.advanceTimersByTime(2000); });

        expect(api.syncChatDraftToServer).not.toHaveBeenCalled();

        const titleSaves = api.saveChatToServer.mock.calls.filter((call) => call[0]?.id === 'chat-a');
        expect(titleSaves.at(-1)?.[0]).toMatchObject({ title: 'Renamed A', draft: 'half a thought' });
    });

    it('puts the title back and warns when the server refuses the save', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        const row = screen.getByText('Chat A').closest('[class*="chatButton"]') as HTMLElement;
        await userEvent.click(within(row).getByLabelText('Rename chat'));
        const titleInput = screen.getByDisplayValue('Chat A');
        await userEvent.clear(titleInput);
        await userEvent.type(titleInput, 'Renamed A');
        await userEvent.keyboard('{Enter}');

        expect(screen.getByText('Renamed A')).toBeInTheDocument();

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.getByText('Chat A')).toBeInTheDocument();
        expect(screen.queryByText('Renamed A')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('renames without calling the server when signed out', async () => {
        api.checkSession.mockResolvedValue({ authenticated: false });
        localStorage.setItem('chatList', JSON.stringify([{
            id: 'offline-chat',
            title: 'Offline chat',
            draft: '',
            model: 'gemini-3.5-flash',
            messages: [message('user', 'a local question', 1)],
        }]));
        localStorage.setItem('activeChatId', 'offline-chat');
        render(<App />);
        await screen.findByText('a local question');

        await userEvent.click(screen.getByLabelText('Rename chat'));
        const titleInput = screen.getByDisplayValue('Offline chat');
        await userEvent.clear(titleInput);
        await userEvent.type(titleInput, 'Renamed offline');
        await userEvent.keyboard('{Enter}');

        expect(screen.getByText('Renamed offline')).toBeInTheDocument();
        expect(api.saveChatToServer).not.toHaveBeenCalled();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});

describe('saving chat settings', () => {
    it('puts the model back and warns when the server refuses the save', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getByText('claude-fable-5'));
        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('claude-fable-5');
        expect(api.saveChatToServer.mock.calls.at(-1)?.[0].messages).toEqual([]);

        await act(async () => {
            save.resolve(false);
        });

        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('gemini-3.5-flash');
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('puts back the dropdown model when the chat had none of its own', async () => {
        localStorage.removeItem('model');
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);
        api.loadChatsFromServer.mockResolvedValue([
            { id: 'chat-a', title: 'Chat A', draft: '', messages: [], model: '' },
            { id: 'chat-b', title: 'Chat B', draft: '', messages: [], model: 'gemini-3.5-flash' },
        ]);

        render(<App />);
        await screen.findByText('A question 1');

        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('gemini-3.5-flash');

        await userEvent.click(screen.getByText('claude-fable-5'));
        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('claude-fable-5');

        await act(async () => {
            save.resolve(false);
        });

        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('gemini-3.5-flash');
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('puts the notes switch back and warns when the server refuses the save', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        const notesSwitch = screen.getByRole('switch', { name: 'Notes' });
        await userEvent.click(notesSwitch);
        expect(notesSwitch).toHaveAttribute('aria-checked', 'true');

        await act(async () => {
            save.resolve(false);
        });

        expect(notesSwitch).toHaveAttribute('aria-checked', 'false');
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('puts the system prompt switch back and warns when the server refuses the save', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        const promptSwitch = screen.getByRole('switch', { name: 'System Prompt' });
        await userEvent.click(promptSwitch);
        expect(promptSwitch).toHaveAttribute('aria-checked', 'false');

        await act(async () => {
            save.resolve(false);
        });

        expect(promptSwitch).toHaveAttribute('aria-checked', 'true');
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('keeps a later reasoning change when the earlier model save fails', async () => {
        const modelSave = deferred<boolean>();
        const reasoningSave = deferred<boolean>();
        api.saveChatToServer
            .mockReturnValueOnce(modelSave.promise)
            .mockReturnValueOnce(reasoningSave.promise);

        render(<App />);
        await screen.findByText('A question 1');

        await userEvent.click(screen.getByText('claude-fable-5'));
        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('claude-fable-5');

        fireEvent.change(screen.getByLabelText('Reasoning'), { target: { value: '4' } });
        expect(screen.getByText('high')).toBeInTheDocument();

        await act(async () => {
            modelSave.resolve(false);
        });

        expect(document.querySelector('[class*="modelSelected"]')).toHaveTextContent('gemini-3.5-flash');

        await act(async () => {
            reasoningSave.resolve(true);
        });

        expect(screen.getByText('high')).toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });

    it('puts the reasoning level back and warns when the server refuses the save', async () => {
        const save = deferred<boolean>();
        api.saveChatToServer.mockReturnValueOnce(save.promise);

        render(<App />);
        await screen.findByText('A question 1');

        fireEvent.change(screen.getByLabelText('Reasoning'), { target: { value: '4' } });
        expect(screen.getByText('high')).toBeInTheDocument();

        await act(async () => {
            save.resolve(false);
        });

        expect(screen.getByText('medium')).toBeInTheDocument();
        expect(screen.queryByText('high')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Could not save the change. The chat was left as it was.'
        );
    });
});

// Signed out, localStorage is not a backup of the database: it IS the database. Nothing about
// editing changes shape between the two modes except where the result lands, so what these
// cases watch is that the disk ends up holding the same conversation the screen shows — and
// that not one server call escapes on the way.
describe('editing a sent message while signed out', () => {
    const OFFLINE_CHAT = 'offline-chat';

    /** No _id, like every message a signed-out browser has ever stored. */
    function localMessage(role: 'user' | 'model', text: string, minute: number): Message {
        return {
            role,
            parts: [{ text }],
            createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString(),
        };
    }

    function storedMessages() {
        const chats = JSON.parse(localStorage.getItem('chatList') || '[]');
        return chats.find((chat: { id: string }) => chat.id === OFFLINE_CHAT)
            ?.messages.map((msg: Message) => msg.parts[0].text);
    }

    beforeEach(() => {
        api.checkSession.mockResolvedValue({ authenticated: false });
        // Seeded before render: initializeApp reads the disk on its very first line, before
        // the session call it then finds unauthenticated.
        localStorage.setItem('chatList', JSON.stringify([{
            id: OFFLINE_CHAT,
            title: 'Offline chat',
            draft: '',
            model: 'gemini-3.5-flash',
            messages: [
                localMessage('user', 'a local question', 1),
                localMessage('model', 'a local answer', 2),
                localMessage('user', 'a second local question', 3),
                localMessage('model', 'a second local answer', 4),
            ],
        }]));
        localStorage.setItem('activeChatId', OFFLINE_CHAT);
    });

    it('writes the new wording to the disk and calls no one', async () => {
        render(<App />);
        await screen.findByText('a local question');

        const bubble = screen.getByText('a local question').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));
        await userEvent.clear(within(bubble).getByRole('textbox'));
        await userEvent.type(within(bubble).getByRole('textbox'), 'a local question edited');
        await userEvent.click(within(bubble).getByTitle('Save'));

        expect(screen.getByText('a local question edited')).toBeInTheDocument();
        expect(screen.getByText('a second local answer')).toBeInTheDocument();
        expect(storedMessages()).toEqual([
            'a local question edited',
            'a local answer',
            'a second local question',
            'a second local answer',
        ]);
        expect(api.updateMessageOnServer).not.toHaveBeenCalled();
        expect(api.saveMessageToServer).not.toHaveBeenCalled();
        expect(api.fetchChatResponse).not.toHaveBeenCalled();
    });

    it('cuts the branch on the disk when it asks for a new reply', async () => {
        const answer = deferred<{ text: string }>();
        api.fetchChatResponse.mockReturnValue(answer.promise);

        render(<App />);
        await screen.findByText('a local question');

        const bubble = screen.getByText('a local question').closest('[class*="messageWrapper"]') as HTMLElement;
        await userEvent.click(within(bubble).getByTitle('Edit message'));
        await userEvent.clear(within(bubble).getByRole('textbox'));
        await userEvent.type(within(bubble).getByRole('textbox'), 'a local question edited');
        await userEvent.click(within(bubble).getByTitle('Save and reply'));

        await screen.findByText('Thinking...');
        expect(screen.queryByText('a second local answer')).not.toBeInTheDocument();
        // The prompt reaches the disk before the answer exists: closing the tab mid-generation
        // loses the reply, never the question. And "Thinking..." is not part of it.
        expect(storedMessages()).toEqual(['a local question edited']);

        const history = api.fetchChatResponse.mock.calls[0][0] as Message[];
        expect(history.at(-1)?.parts[0].text).toBe('a local question edited');
        expect(api.updateMessageOnServer).not.toHaveBeenCalled();
        expect(api.deleteMessageFromServer).not.toHaveBeenCalled();
        expect(api.saveMessageToServer).not.toHaveBeenCalled();

        await act(async () => {
            answer.resolve({ text: 'a fresh local answer' });
        });
        await screen.findByText('a fresh local answer');
        expect(storedMessages()).toEqual(['a local question edited', 'a fresh local answer']);
    });
});

describe('notices from Account', () => {
    it('shows a failed login above the prompt', async () => {
        api.checkSession.mockResolvedValue({ authenticated: false });
        api.loginOrRegister.mockRejectedValue(new Error('Invalid credentials'));
        localStorage.setItem('chatList', JSON.stringify([{
            id: 'offline-chat',
            title: 'Offline chat',
            draft: '',
            model: 'gemini-3.5-flash',
            messages: [message('user', 'a local question', 1)],
        }]));
        localStorage.setItem('activeChatId', 'offline-chat');

        render(<App />);
        await screen.findByText('a local question');

        await userEvent.click(screen.getByTitle('Account'));
        await userEvent.type(screen.getByPlaceholderText('Your email'), 'user@example.com');
        await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong-password');
        await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

        expect(await screen.findByRole('status')).toHaveTextContent('Error: Invalid credentials');
        expect(screen.getByPlaceholderText('Write a message...')).toBeInTheDocument();
    });
});
