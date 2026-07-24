# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@import ./AGENTS.md

> See **`AGENTS.md`** at the repo root for the full Dual-Mode (Online/Offline) architecture, `pnpm` commands, project structure, the monochrome design system (Space Grotesk, pill-shapes), and commit/TypeScript conventions. It is the source of truth for day-to-day rules; this file only adds things AGENTS.md doesn't cover.

## Additional notes for Claude Code

- **No test suite exists** (no test runner configured in any `package.json`, no `*.test.*` files). Don't assume `pnpm test` works. Verification is `pnpm build` (client, runs `tsc -b` then `vite build`) and `pnpm lint` (client only — the server has no lint script).
- **Provider logic is duplicated by design, keep both in sync.** The same set of AI providers (Google Gemini, Anthropic, OpenAI, LM Studio, Ollama) is implemented twice with parallel request-building logic:
  - `client/src/services/providers.ts` — used in **Offline Mode**, calls provider APIs directly from the browser with keys from `localStorage`.
  - `server/services/providerService.js` — used in **Online Mode**, called from `server/controllers/chatController.js`, uses `server/.env` keys or a per-request `x-user-api-key` header.
  When adding/changing a provider or a request shape (system prompt handling, thinking/reasoning config, etc.), update both files identically or the two modes will diverge in behavior.
- **`client/src/config/models.config.ts`** (`MODEL_REGISTRY`) is the single source of truth for known model IDs, their provider, and thinking/reasoning budgets. Both the offline client path and the payload sent to the server's `/api/chats/:chatId/messages` endpoint derive `provider`/`thinkingBudget` from this file — add new models here first.
- **Persistence order matters.** `localStorage` (`client/src/utils/storage.ts`) is always the first write and the fallback source of truth; server sync (`client/src/services/api.ts`) is best-effort on top of it (see `saveToLocalDisk` calls preceding `saveChatToServer`/`syncChatDraftToServer` in `App.tsx`). Keep this ordering when touching chat/message/draft mutation handlers so the app still works fully offline.
- **Message pagination**: chats load with an empty `messages` array from `GET /api/chats`; the newest 6 messages are fetched lazily per-chat on selection, older ones via cursor (`before`, an ISO date) — see the `useEffect` and `handleLoadMoreMessages` in `client/src/App.tsx` plus `getMessages` in `server/controllers/chatController.js`.
- **Production serving**: `server/server.js` serves `client/dist` as static files and has a catch-all route to `index.html` for SPA routing — so `pnpm build` (client) must run before `pnpm start` reflects frontend changes in Online Mode.
- Two project skills exist under `.agents/skills/` and are relevant to most changes here: `smart-commit` (exact commit message format/workflow — use it instead of freeform commit messages) and `switchat-design-system` (full CSS variables/tokens for any UI work).
