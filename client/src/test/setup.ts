import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement ResizeObserver, and PromptInput instantiates one on mount to
// report its own height. Without this stub nothing renders at all.
class ResizeObserverStub implements ResizeObserver {
    observe(): void { }
    unobserve(): void { }
    disconnect(): void { }
}

globalThis.ResizeObserver = ResizeObserverStub;

// Same story with scrollTo: MessageView keeps the conversation pinned to the bottom, and
// jsdom implements no scrolling at all.
Element.prototype.scrollTo = () => { };

// Every test mounts into the same document: unmount so the next one starts empty.
afterEach(() => {
    cleanup();
    localStorage.clear();
});
