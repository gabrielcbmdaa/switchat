import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import MessageView from './MessageView';
import type { Message } from '../types';

function message(role: 'user' | 'model', text: string): Message {
    return { _id: `id-${text}`, role, parts: [{ text }] };
}

const messages: Message[] = [
    message('user', 'pregunta vieja'),
    message('model', 'respuesta vieja'),
];

const baseProps = {
    chatId: 'chat-a',
    hasMoreMap: {},
    loadedChatIds: { 'chat-a': true },
    onLoadMore: () => { },
    onDeleteMessage: () => { },
    onRetryMessage: () => { },
    token: 'un-token',
    draft: '',
    onDraftChange: () => { },
    onSendMessage: () => { },
};

// MessageView pide muchas props y solo tres importan aquí: el resto son los mínimos
// para que monte. onLoadMore es la que el test observa.
function renderMessageView(
    onLoadMore: () => void,
    overrides: Partial<{ messages: Message[]; hasMoreMap: Record<string, boolean>; token: string | null }> = {},
) {
    return render(
        <MessageView
            messages={overrides.messages ?? messages}
            chatId="chat-a"
            hasMoreMap={overrides.hasMoreMap ?? {}}
            loadedChatIds={{ 'chat-a': true }}
            onLoadMore={onLoadMore}
            onDeleteMessage={() => { }}
            onRetryMessage={() => { }}
            token={overrides.token === undefined ? 'un-token' : overrides.token}
            draft=""
            onDraftChange={() => { }}
            onSendMessage={() => { }}
        />
    );
}

// jsdom never lays a box out, so the real "does this page overflow?" answer is
// whatever the test writes here. A spy on the prototype is the only way the
// check can see it during the first paint.
function fakePageSize(scrollHeight: number, clientHeight: number) {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
}

// jsdom has no layout, so nothing ever resizes: keep the callback the view registers for its
// own column, and the box it asked to observe, to fire and inspect them by hand.
function captureColumnObserver() {
    const captured: { callback?: () => void; box?: string } = {};
    vi.stubGlobal('ResizeObserver', class {
        private readonly callback: () => void;
        constructor(callback: () => void) { this.callback = callback; }
        observe(target: Element, options?: ResizeObserverOptions) {
            if (String((target as HTMLElement).className).includes('messageViewContainer')) {
                captured.callback = this.callback;
                captured.box = options?.box;
            }
        }
        unobserve() { }
        disconnect() { }
    });
    return captured;
}

afterEach(() => {
    // A test that switches to fake timers and then fails never reaches its own
    // vi.useRealTimers(), and every later test that waits on real time hangs until the
    // 5000 ms cap. Same pattern as AppNotice.test.tsx.
    vi.useRealTimers();
    // restoreAllMocks does not undo vi.stubGlobal: a test that replaced a global and failed
    // would leave it replaced for the rest of the file.
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('cargar mensajes antiguos', () => {
    it('ya no ofrece un botón: el scroll es el único gesto', () => {
        renderMessageView(() => { });

        expect(screen.queryByText(/load earlier messages/i)).not.toBeInTheDocument();
    });

    it('pide más al llegar arriba del todo, que es lo que sustituye al botón', () => {
        const onLoadMore = vi.fn();
        renderMessageView(onLoadMore);

        // jsdom no calcula layout, pero scrollTop arranca en 0, que es justo el caso que
        // dispara la carga (handleScroll pide más por debajo de 300px del techo).
        const scroller = screen
            .getByText('pregunta vieja')
            .closest('[class*="messageViewContainer"]') as HTMLElement;
        fireEvent.scroll(scroller);

        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('asks for the next page when the messages fit and nothing can scroll', () => {
        fakePageSize(100, 400);
        const onLoadMore = vi.fn();
        renderMessageView(onLoadMore);

        const scroller = screen
            .getByText('pregunta vieja')
            .closest('[class*="messageViewContainer"]') as HTMLElement;
        expect(scroller.clientHeight).toBe(400);
        expect(scroller.scrollHeight).toBe(100);
        expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('does not ask on mount when the messages already overflow', () => {
        fakePageSize(800, 400);
        const onLoadMore = vi.fn();
        renderMessageView(onLoadMore);

        expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('does not ask when the server already said there is nothing older', () => {
        fakePageSize(100, 400);
        const onLoadMore = vi.fn();
        renderMessageView(onLoadMore, { hasMoreMap: { 'chat-a': false } });

        expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('asks again when the page that just arrived still fits', () => {
        fakePageSize(100, 400);
        const onLoadMore = vi.fn();
        const { rerender } = renderMessageView(onLoadMore);
        expect(onLoadMore).toHaveBeenCalledTimes(1);

        rerender(
            <MessageView
                messages={[
                    message('user', 'más vieja'),
                    message('model', 'respuesta más vieja'),
                    ...messages,
                ]}
                chatId="chat-a"
                hasMoreMap={{}}
                loadedChatIds={{ 'chat-a': true }}
                onLoadMore={onLoadMore}
                onDeleteMessage={() => { }}
                onRetryMessage={() => { }}
                token="un-token"
                draft=""
                onDraftChange={() => { }}
                onSendMessage={() => { }}
            />
        );

        expect(onLoadMore).toHaveBeenCalledTimes(2);
    });

    // While an answer is being written, the render after the request is a streaming batch,
    // not the page. It used to consume the "request out" flag, skip following the answer
    // and ask for the same page a second time.
    it('does not ask again, and keeps following the answer, while the older page is on its way', () => {
        fakePageSize(100, 400);
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();
        const onLoadMore = vi.fn(() => new Promise<void>(() => { }));
        const user = message('user', 'la pregunta');

        const { rerender } = renderMessageView(onLoadMore, {
            messages: [user, { role: 'model', parts: [{ text: 'Hola' }], isTemporary: true }],
        });
        expect(onLoadMore).toHaveBeenCalledTimes(1);
        act(() => { vi.runAllTimers(); });
        scrollTo.mockClear();

        rerender(
            <MessageView
                {...baseProps}
                onLoadMore={onLoadMore}
                messages={[user, { role: 'model', parts: [{ text: 'Hola qué tal' }], isTemporary: true }]}
            />
        );
        act(() => { vi.runAllTimers(); });

        expect(onLoadMore).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('keeps the reader on the same line when older messages arrive on top', () => {
        let contentHeight = 1000;
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
        // jsdom lays nothing out: say where each bubble's top sits. The first bubble starts
        // 52 px down (the column's top padding in the real CSS); the old first message ends
        // up 400 px below it, which is what the page added above it.
        vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
            return this.textContent?.includes('pregunta vieja') ? 452 : 52;
        });
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();

        const { rerender } = renderMessageView(() => { });
        act(() => { vi.runAllTimers(); });
        const scroller = screen
            .getByText('pregunta vieja')
            .closest('[class*="messageViewContainer"]') as HTMLElement;
        // jsdom stores scrollTop as a plain number: the reader is reading 300 px down.
        scroller.scrollTop = 300;
        scrollTo.mockClear();

        // The page before arrives on top and adds 400 px above the reader.
        contentHeight = 1400;
        rerender(
            <MessageView
                {...baseProps}
                messages={[message('user', 'más vieja'), message('model', 'respuesta más vieja'), ...messages]}
            />
        );
        act(() => { vi.runAllTimers(); });

        expect(scroller.scrollTop).toBe(700);
        expect(scrollTo).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    // Measured on 2026-09-27: a panel switched between two renders reflowed the column, the
    // height saved at the last render went stale, and the reader moved 1911 px when the older
    // page arrived.
    it('keeps the reader on the same line even if the column reflowed since the last render', () => {
        let contentHeight = 1000;
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
        // jsdom lays nothing out: say where each bubble's top sits. The first bubble starts
        // 52 px down (the column's top padding in the real CSS); the old first message ends
        // up 400 px below it, which is what the page added above it.
        vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
            return this.textContent?.includes('pregunta vieja') ? 452 : 52;
        });
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();

        const { rerender } = renderMessageView(() => { });
        act(() => { vi.runAllTimers(); });
        const scroller = screen
            .getByText('pregunta vieja')
            .closest('[class*="messageViewContainer"]') as HTMLElement;
        scroller.scrollTop = 300;
        scrollTo.mockClear();

        // A panel opened since the last render: the column reflowed, so the 1000 px saved
        // then is stale. Now the older page arrives on top and adds 400 px above the reader.
        contentHeight = 2400;
        rerender(
            <MessageView
                {...baseProps}
                messages={[message('user', 'más vieja'), message('model', 'respuesta más vieja'), ...messages]}
            />
        );
        act(() => { vi.runAllTimers(); });

        expect(scroller.scrollTop).toBe(700);
        expect(scrollTo).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    // Offline the page is already in memory: setVisibleCount shows it at once, and the only
    // release of the guard is noticing that the list grew at the front. Missing that would
    // show one extra page and never load the rest of the history.
    it('keeps loading local history offline until it no longer fits', () => {
        fakePageSize(100, 400);
        const local = Array.from({ length: 20 }, (_, i) => message(i % 2 === 0 ? 'user' : 'model', `m${i}`));

        renderMessageView(() => { }, { messages: local, token: null });

        expect(screen.getByText('m0')).toBeInTheDocument();
    });
});

describe('the editor follows the message, not the seat', () => {
    // Loading older turns prepends them. A key that is just 0, 1, 2 would leave the
    // open editor on seat 0, which is now a different message, and Save would rewrite
    // the wrong turn.
    it('keeps the open editor on the message that was being edited', async () => {
        const onSaveMessage = vi.fn();
        const current: Message[] = [
            message('user', 'pregunta actual'),
            message('model', 'respuesta actual'),
        ];
        const viewProps = {
            chatId: 'chat-a',
            hasMoreMap: {},
            loadedChatIds: { 'chat-a': true },
            onLoadMore: () => { },
            onDeleteMessage: () => { },
            onRetryMessage: () => { },
            onSaveMessage,
            token: 'un-token',
            draft: '',
            onDraftChange: () => { },
            onSendMessage: () => { },
        };
        const { rerender } = render(
            <MessageView messages={current} {...viewProps} />
        );

        await userEvent.click(screen.getByTitle('Edit message'));
        const editor = screen.getAllByRole('textbox').find((el) => (el as HTMLTextAreaElement).value === 'pregunta actual');
        expect(editor).toBeDefined();
        await userEvent.clear(editor!);
        await userEvent.type(editor!, 'pregunta corregida');

        rerender(
            <MessageView
                messages={[
                    message('user', 'pregunta vieja'),
                    message('model', 'respuesta vieja'),
                    ...current,
                ]}
                {...viewProps}
            />
        );

        await userEvent.click(screen.getByTitle('Save'));

        expect(onSaveMessage).toHaveBeenCalledWith(2, 'pregunta corregida');
    });
});

// An empty chat: the greeting, the template row and the centered composer. Signed out on
// purpose, so nothing waits on a server round trip to decide the view is really empty.
function renderEmptyChat(onUseTemplate: (templateId: string) => void, isNewChat = true) {
    return render(
        <MessageView
            messages={[]}
            chatId="chat-nuevo"
            isNewChat={isNewChat}
            hasMoreMap={{}}
            loadedChatIds={{}}
            onLoadMore={() => { }}
            onDeleteMessage={() => { }}
            onRetryMessage={() => { }}
            token={null}
            draft=""
            onDraftChange={() => { }}
            onSendMessage={() => { }}
            onUseTemplate={onUseTemplate}
        />
    );
}

describe('templates in the empty chat view', () => {
    it('offers the welcome tutorial as a starting point', () => {
        renderEmptyChat(() => { });

        expect(screen.getByRole('button', { name: '🚀 Welcome & Tutorial' })).toBeInTheDocument();
    });

    it('reports the template that was picked', async () => {
        const onUseTemplate = vi.fn();
        renderEmptyChat(onUseTemplate);

        await userEvent.click(screen.getByRole('button', { name: '🚀 Welcome & Tutorial' }));

        expect(onUseTemplate).toHaveBeenCalledWith('welcome');
    });

    it('keeps them out of a conversation that exists but happens to be empty', () => {
        // Only the new-chat view offers a starting point. A real chat left with no messages
        // is still that chat: starting a template from inside it builds a SECOND one and
        // leaves this one sitting in the list with nothing in it.
        renderEmptyChat(() => { }, false);

        expect(screen.queryByRole('group', { name: 'Start from a template' })).not.toBeInTheDocument();
    });

    it('keeps them out of a chat that already has messages', () => {
        renderMessageView(() => { });

        expect(screen.queryByRole('group', { name: 'Start from a template' })).not.toBeInTheDocument();
    });
});

describe('the English tutor template in the empty chat view', () => {
    it('sits next to the welcome tutorial', () => {
        renderEmptyChat(() => { });

        expect(screen.getByRole('button', { name: 'English Tutor' })).toBeInTheDocument();
    });
});

describe('following the text while it is written', () => {
    it('scrolls when the last message grew without a new message arriving', () => {
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();

        const before: Message[] = [
            { role: 'user', parts: [{ text: 'la pregunta' }] },
            { role: 'model', parts: [{ text: 'Hola' }], isTemporary: true },
        ];
        const after: Message[] = [
            before[0],
            { role: 'model', parts: [{ text: 'Hola qué tal' }], isTemporary: true },
        ];

        const { rerender } = render(<MessageView {...baseProps} messages={before} />);
        act(() => { vi.runAllTimers(); });
        scrollTo.mockClear();

        rerender(<MessageView {...baseProps} messages={after} />);
        act(() => { vi.runAllTimers(); });

        expect(scrollTo).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('does not jump to the end when the finished answer replaces the bubble and the reader scrolled up', () => {
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();
        // 1000 - 0 - 400 = 600 px from the bottom, past the 200 px "still following" line.
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);

        const user = { role: 'user' as const, parts: [{ text: 'la pregunta' }] };
        const before: Message[] = [
            user,
            { role: 'model', parts: [{ text: 'Hola qué tal' }], isTemporary: true },
        ];
        const after: Message[] = [
            { ...user },
            { role: 'model', parts: [{ text: 'Hola qué tal' }] },
        ];

        const { rerender } = render(<MessageView {...baseProps} messages={before} />);
        act(() => { vi.runAllTimers(); });
        scrollTo.mockClear();

        rerender(<MessageView {...baseProps} messages={after} />);
        act(() => { vi.runAllTimers(); });

        expect(scrollTo).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    // Measured in the browser: with reasoning off Gemini sends few, large chunks, and one of
    // 746 characters was ~308 px tall. Measuring the distance AFTER painting it counted the
    // new text as distance the reader had travelled, so the view stopped following a reader
    // who never touched the scrollbar.
    it('keeps following a reader at the bottom when one batch is taller than the 200 px margin', () => {
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();
        let contentHeight = 1000;
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
        // 1000 - 600 - 400 = 0 px: the reader is exactly at the bottom.
        vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockReturnValue(600);

        const user = { role: 'user' as const, parts: [{ text: 'la pregunta' }] };
        const before: Message[] = [
            user,
            { role: 'model', parts: [{ text: 'Hola' }], isTemporary: true },
        ];
        const after: Message[] = [
            user,
            { role: 'model', parts: [{ text: 'Hola, y aquí llega de golpe un párrafo entero' }], isTemporary: true },
        ];

        const { rerender } = render(<MessageView {...baseProps} messages={before} />);
        act(() => { vi.runAllTimers(); });
        scrollTo.mockClear();

        // One batch adds 500 px. Measured after painting it, the reader would look 500 px away.
        contentHeight = 1500;
        rerender(<MessageView {...baseProps} messages={after} />);
        act(() => { vi.runAllTimers(); });

        expect(scrollTo).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('still leaves alone a reader who scrolled up while the answer grows', () => {
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();
        let contentHeight = 1000;
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
        // 1000 - 0 - 400 = 600 px above the bottom before the batch arrives.
        vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockReturnValue(0);

        const user = { role: 'user' as const, parts: [{ text: 'la pregunta' }] };
        const before: Message[] = [
            user,
            { role: 'model', parts: [{ text: 'Hola' }], isTemporary: true },
        ];
        const after: Message[] = [
            user,
            { role: 'model', parts: [{ text: 'Hola qué tal' }], isTemporary: true },
        ];

        const { rerender } = render(<MessageView {...baseProps} messages={before} />);
        act(() => { vi.runAllTimers(); });
        scrollTo.mockClear();

        contentHeight = 1100;
        rerender(<MessageView {...baseProps} messages={after} />);
        act(() => { vi.runAllTimers(); });

        expect(scrollTo).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('keeps following after the window widens mid-answer', () => {
        const column = captureColumnObserver();
        const scrollTo = vi.fn();
        Element.prototype.scrollTo = scrollTo;
        vi.useFakeTimers();
        let contentHeight = 1000;
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);

        const user = { role: 'user' as const, parts: [{ text: 'la pregunta' }] };
        const { rerender } = render(
            <MessageView {...baseProps} messages={[user, { role: 'model', parts: [{ text: 'Hola' }], isTemporary: true }]} />
        );
        act(() => { vi.runAllTimers(); });
        const scroller = screen
            .getByText('la pregunta')
            .closest('[class*="messageViewContainer"]') as HTMLElement;
        // The reader sits at the bottom: 1000 - 600 - 400 = 0.
        scroller.scrollTop = 600;

        // The window widens: the same text now measures 700 px and the browser clamps the
        // scroll to the new bottom. The view does not render; only its column changed size.
        contentHeight = 700;
        scroller.scrollTop = 300;
        act(() => { column.callback?.(); });
        scrollTo.mockClear();

        // A batch arrives: 300 px more text.
        contentHeight = 1000;
        rerender(
            <MessageView {...baseProps} messages={[user, { role: 'model', parts: [{ text: 'Hola, y un párrafo entero más' }], isTemporary: true }]} />
        );
        act(() => { vi.runAllTimers(); });

        expect(column.callback).toBeDefined();
        expect(scrollTo).toHaveBeenCalled();
        vi.useRealTimers();
    });

    // A classic scrollbar appearing, or the prompt's padding growing, changes only the
    // content box, in the same frame as a batch and before the scroll effect: observing that
    // box would save the height with the batch already in.
    it('watches the border box of its column, which a scrollbar does not change', () => {
        const column = captureColumnObserver();

        render(<MessageView {...baseProps} messages={messages} />);

        expect(column.box).toBe('border-box');
    });

    // A new chat has no column until its first message: the observer must attach then.
    it('observes the column of a chat that started empty', () => {
        const column = captureColumnObserver();

        const { rerender } = render(<MessageView {...baseProps} messages={[]} isNewChat />);
        expect(column.callback).toBeUndefined();

        rerender(<MessageView {...baseProps} messages={[message('user', 'la primera')]} isNewChat />);

        expect(column.callback).toBeDefined();
    });
});
