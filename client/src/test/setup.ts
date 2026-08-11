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

// Every test mounts into the same document: unmount so the next one starts empty.
afterEach(() => {
    cleanup();
    localStorage.clear();
});
