# 🤖 Switchat — Context and Instructions for AI Agents

This document defines the development environment, the Dual-Mode architecture, the schemas and the design rules for AI assistants and agents working in this repository.

---

## 📌 1. Project Description

**Switchat** is a hybrid platform built to connect and manage conversations with multiple Large Language Models (LLMs): **Google Gemini**, **Anthropic Claude**, **OpenAI (ChatGPT)**, and local inference servers through **LM Studio** and **Ollama**. Those are the five providers implemented in `client/src/services/providers.ts`; if this list and that file ever disagree, the file wins.

### Dual-Mode Architecture:

> Calls to AI providers **always leave from the browser**, in both modes, using the user's own API Keys. The server never calls a provider: it only stores data. The only thing that changes between modes is **where that data is stored**.

- **Online Mode (Signed In):** Syncs chats, messages and drafts to **MongoDB** through the Express server, with password authentication via `bcrypt` and session cookies signed with `JWT`. It includes an incremental cursor pagination optimization (`before` / `limit` of 6 messages) so long conversations render fast. The server also acts as **custodian** for API Keys encrypted with AES-256-GCM — but it never uses them, and it only stores the ones the user has marked one by one from the `AccountView` list: signing in downloads keys, it never uploads any.
- **Offline Mode (Signed Out):** Stores everything locally in the browser's `localStorage`, and nothing travels to the database.

---

## 🚀 2. Development Environment and Commands (`pnpm`)

This project is a monorepo managed with **`pnpm` workspaces**.

- **Install dependencies:** `pnpm install`
- **Full Development Mode (Frontend + Backend):** `pnpm dev` — the only command that gives you hot reload on both sides: Vite HMR on the client and `node --watch` on the server.
- **Development Mode (Frontend only - `http://localhost:5173`):** `pnpm dev:client`
- **Backend only (`http://localhost:3000`):** `pnpm dev:server` — despite the name, this runs the server's `start` script (plain `node server.js`), **not** its `dev` one, so it does **not** reload when you edit a file. Restart it by hand, or use `pnpm dev` if you want watch mode.
- **Build the client:** `pnpm build`
- **Run the linter:** `pnpm lint`
- **Run the tests:** `pnpm test` — runs both workspaces, server first. The server suite needs a MongoDB you can reach; it connects to `mongodb://127.0.0.1:27017/switchat_test` unless you set `MONGO_URI_TEST`, and it **wipes every collection between cases**, so the helper refuses to run against a database whose name does not end in `_test`. The client suite is Vitest on jsdom and needs nothing running. Either one alone: `pnpm --filter server test` / `pnpm --filter client test`.

> ⚠️ **Golden Rule:** **Always** use `pnpm` and its filters (`pnpm --filter client ...`). Do **NOT** use `npm` or `yarn`.

---

## 📂 3. Directory Structure
```text
switchat/
├── client/                     # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/         # Reusable components (SvgIcons, Toolbar, PromptInput...)
│   │   ├── config/             # Global configuration and constants
│   │   ├── services/           # API integration services (api.ts for online sync)
│   │   ├── test/               # Vitest setup (jsdom stubs the app needs on mount)
│   │   ├── utils/              # Helper functions (resizer, storage helpers, etc.)
│   │   ├── views/              # Main views (ChatView, MessageView, SettingsView, AccountView...)
│   │   ├── App.tsx             # UI entry point and global state management
│   │   └── index.css           # Design tokens and global styles
├── server/                     # Node.js + Express 5 + Mongoose
│   ├── controllers/            # Logic controllers (authController, chatController, apiKeyController)
│   ├── middleware/             # Authorization middleware (authMiddleware)
│   ├── models/                 # Mongoose database models (User, Chat, Message, ApiKey)
│   ├── routes/                 # Express API routes (authRoutes, chatRoutes, apiKeyRoutes)
│   ├── services/               # Internal services (encryptionService: AES-256-GCM, userDataService)
│   ├── tests/                  # Integration tests (node:test + supertest, real MongoDB)
│   ├── app.js                  # Builds and exports the Express app — no side effects on import
│   └── server.js               # Startup only: MongoDB connections and the listen call
```

---

## ⚙️ 4. Environment Configuration (`server/.env`)

To run the server locally, make sure you have a `server/.env` file configured after `server/.env.example`:
- `PORT`: Port the server listens on (defaults to `3000`).
- `MONGO_URI`: Connection string for the MongoDB database, self-hosted or on Atlas. Development and production use separate databases; see "Database setup" in the README.
- `JWT_SECRET`: Signing secret for authentication JWTs.
- `ENCRYPTION_KEY`: AES-256-GCM key for the API Keys users sync. It must decode to **exactly 32 bytes** (`openssl rand -base64 32`) and it must **not** be the same value as `JWT_SECRET`. The server **refuses to start** without it.
- `NODE_ENV`: Runtime environment (`development` / `production`).
- `REGISTRATION_ENABLED`: Switch for new account registration (open by default). With the exact value `"false"`, `POST /api/auth/register` answers `403` before touching the database, and the server logs a notice about it on startup. Existing users can still sign in normally.

---

## 🗄️ 5. Reading the database

Read whatever database `MONGO_URI` in `server/.env` points at, and assume it is a local development one unless the user says otherwise. `mongosh` ships with MongoDB; for a single query prefer the one-shot form, which needs no interactive session:

```bash
mongosh --quiet "<the MONGO_URI from server/.env>" --eval 'db.users.countDocuments()'
```

Useful starting points:

```js
db.getCollectionNames()                                  // users, chats, messages, apikeys
db.users.findOne()                                       // shape of a document
db.chats.find({}, { id: 1, title: 1, userId: 1 })        // pick fields instead of dumping all
db.messages.find().sort({ createdAt: -1 }).limit(10)
```

The four collections map one-to-one to the Mongoose models in `server/models/`. They exist even in an empty database, because Mongoose creates them when it builds their indexes on startup — an empty collection is not evidence that a feature never ran.

**Rules when reading it:**

- **Never print secret material in full.** `users.password` is a bcrypt hash and `apikeys.key` is an AES-256-GCM ciphertext; both belong to a real person even in development. Show the shape (prefix, length, field names) and truncate the rest — a transcript is not a place for a credential, encrypted or not.
- **Never decrypt API keys to inspect them.** The `encryptionService` exists to serve the app, not to satisfy curiosity in a debugging session.
- **Writing to a development database is fine and expected** — wiping it, seeding it, or breaking it on purpose is exactly what it is for, and `db.dropDatabase()` is recoverable because the server recreates the collections on the next start. **Any database holding real accounts is read-only** unless the user explicitly asks for a write. When in doubt about which one you are connected to, ask; the cost of asking is a question, the cost of guessing wrong is someone else's data.

---

## 🎨 6. Visual Design System (Switchat Design System)

When creating or modifying UI components in `client/`, **respecting the strict visual language is mandatory**:

1. **Aesthetic:** Ultra-minimalist tactile monochrome dark mode (no gradients, no loud colors).
2. **Base Color Palette:**
   - Primary background (`--bg-primary`): `#191919` (carbon).
   - Neutral color / Borders / Text (`--color-neutral`): `#858585` (neutral gray).
   - Subtle dividers (`--border-subtle`): `#333333`.
3. **Typography:**
   - Primary (UI & Messages): `'Space Grotesk', sans-serif`.
   - Data / Code / Keys: `ui-monospace, monospace`.
4. **Pill-Shape Geometry:**
   - Every interactive input, button and card uses `border-radius: 20px` or `30px`.
5. **Contrast Inversion on Interaction (Hover / Active):**
   - Interactive elements go from a `#191919` / transparent background with `#858585` text to a `#858585` background with `#191919` text on hover.

> 📘 CSS tokens and global styles: `client/src/index.css`.

> 🎨 **Before creating or modifying any UI, invoke the `switchat-design-system` skill** (`.agents/skills/switchat-design-system/`). The list above is a summary kept short on purpose; the skill is the reference, with the full palette, spacing scale, component specs and interaction states.

---

## 📝 7. Code, Commit and Security Conventions

- **English only — everything, everywhere.** Every single thing that lands in this repository is written in English: UI copy, error messages (client *and* server responses), code comments, JSDoc, identifiers, commit messages, console logs, and documentation. There is no "internal" text exempt from this: a comment is read by whoever comes next, and a server error message ends up in front of a user. The reason is not style, it is cost — a mixed-language codebase forces every reader to switch languages mid-file, and it makes it impossible to tell at a glance whether a Spanish string is a leftover note or a bug about to be shown in the UI. Talking to the user in Spanish in chat is fine; anything **written into the repo** is English.
  - **Legacy exception:** parts of the code still carry Spanish comments and error messages from before this rule. Do not launch a mass rewrite from an unrelated task, but whenever you touch a file, translate what you touch. New code has no excuse.
- **Strict TypeScript:** Keep explicit typing in `client/src/types.ts`. Avoid `any`.
- **Dual Sync:** If you change how chats or messages are stored, make sure it stays compatible with both `localStorage` (Offline) and `api.ts` (Online).
- **Commits:** Use **Conventional Commits** (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`). **Invoke the `smart-commit` skill** (`.agents/skills/smart-commit/`) to write any commit message here — it holds the exact rules this repository uses: lowercase summary ending in a period, `(client)` / `(server)` as the only scopes (omitted when a change spans both), `* ` bullets in the body, and the blank line after the header that Git needs to tell subject from body. Never add an AI `Co-authored-by` trailer: GitHub counts it as a real contributor. This applies to **every** commit, including ones made from inside an implementation plan or by a dispatched subagent — a plan step that says "Commit" does not waive it.
- **Security:** NEVER modify or expose keys or secrets stored in `.secrets/` or `.env`.
- **Mandatory Verification:** Always run `pnpm build`, `pnpm lint` and `pnpm test` before declaring a task finished. `pnpm build` is the client (`tsc -b` + `vite build`), `pnpm lint` is the client only (the server has no lint script), and `pnpm test` covers both workspaces. This is not etiquette: `.github/workflows/deploy.yml` runs those same three on every push to `main`, in a throwaway runner with its own `mongo:7`, and the deploy job declares `needs: test` — so anything red here blocks production, and the VPS is simply left untouched.
- **Tests (`server/tests/`):** integration tests, run with the built-in `node:test` runner plus `supertest`. They import the real Express app from `server/app.js` and hit a real MongoDB — no mocks. That is deliberate: the bugs they guard against were *missing query filters*, and a mocked model reports the call as made whether or not the filter is there. `server/app.js` must therefore stay free of side effects on import: no connections, no `listen`. Those belong in `server/server.js`.
- **Tests (`client/src/**/*.test.tsx`):** Vitest on jsdom, with Testing Library. They mount real components and mock exactly one thing — the `services/api` module — because that is the whole server boundary; `fetchChatResponse` lives there too, so no provider is ever called. `client/src/test/setup.ts` stubs `ResizeObserver` and `Element.scrollTo`, which jsdom does not implement and the app uses on mount. `App.test.tsx` guards the state bugs described in section 8: they only appear while a request is in flight, so the tests hold the model mid-answer with a promise they resolve by hand.

---

## 🧠 8. Architecture: details that must not drift

- **`client/src/services/providers.ts` is the ONLY place that talks to AI providers.** Google Gemini, Anthropic, OpenAI, LM Studio and Ollama are implemented there and nowhere else. The server does not call any provider and must not start doing so again: a duplicated `server/services/providerService.js` used to exist and was deleted on purpose. Routing the request through the server bought the user nothing, and it actively broke the local providers — LM Studio and Ollama pointed at `127.0.0.1`, which in production is the VPS and not the user's machine. A local provider only works if the call leaves from the local machine. If you find yourself adding provider logic under `server/`, that is the signal that the solution belongs somewhere else.
- **The server is a custodian for API Keys, but never uses them.** `server/services/encryptionService.js` encrypts them with AES-256-GCM so they can sync across devices. Encrypting a credential and *exercising* one are different things: only the second would rebuild the path that was removed.
- **Syncing an API Key is opt-in, key by key.** `syncApiKeysWithServer` (`client/src/utils/apiKeys.ts`) **downloads but does not upload**; the only keys that go up are the ones present in `apiKeysLastSynced`, the snapshot of the account that the user edits with the per-row button. If you touch that path, the rule that cannot break is that no local change (saving, deleting, switching the active one) may add keys to the account on its own.
- **`client/src/config/models.config.ts` (`MODEL_REGISTRY`)** is the single source of truth for known model IDs, their provider, and their thinking levels/budgets. `providers.ts` derives the provider and the effective reasoning level from here — add new models here first.
- **Model, reasoning and system prompt are CHAT state, not global preferences.** They live on the `Chat` object (`client/src/types.ts`) and the server persists them in `server/models/Chat.js`. The intuitive move is to store them as a global setting in `localStorage`, and that is exactly what they must not be: `loadDefaultModel`/`saveDefaultModel` (`utils/modelPreferences.ts`) are only **the seed for new chats**, never the active model. Two consequences to respect when touching this: changing the model re-validates the level through `resolveReasoningLevel` (scales are not universal — `'none'` exists on some models and not on others), and chats created before this architecture do not carry the fields, so every reader must tolerate `undefined` and fall back instead of assuming a value.
- **The chat list goes to `localStorage` only while signed out.** Every write goes through `persistIfOffline` (`client/src/App.tsx`), which is a no-op when there is a session — see the comment on it. Online the source of truth is Mongo, and writing the account's chats to `localStorage` would overwrite the ones the user keeps in Offline Mode, which are a different set of conversations and the only copy that exists. Within the offline path the local write still comes **first** and the server sync (`client/src/services/api.ts`) is best-effort on top, so the app keeps working with no network. What does get written in both modes is the active chat id (`utils/uiPreferences.ts`): that is a UI preference of this browser tab, not chat data.
- **Never write the whole `chatList` from a snapshot taken before an `await`.** Anything that resolves after waiting — a model response, an abort, a failed request — must touch **only its own chat**, and must read the live list from `chatListRef.current` rather than the array it closed over. Use `commitChatMessages` (`client/src/App.tsx`); `applyGeneratedTitle` follows the same rule. The reason is not style: while the model answers, the user keeps using the app, and the list changes underneath. Writing the old array back is silent and total — it re-emptied the chat they switched to, resurrected a chat they had deleted (and in Offline Mode wrote it back to `localStorage`, undoing the deletion for good), and discarded a draft they had just typed. Every writer must also tolerate the chat being **gone**: if the id is no longer in the list it was deleted mid-generation, and the right move is to drop the answer, not to recreate the chat.
- **Message pagination:** chats load with `messages: []` from `GET /api/chats`; the 6 most recent messages are fetched lazily when the chat is selected; older ones come through the cursor (`before`, ISO date) — see the `useEffect` and `handleLoadMoreMessages` in `client/src/App.tsx`, and `getMessages` in `server/controllers/chatController.js`. Two separate facts track this and **must not be merged again**: `loadedChatIds` says the first page has already been requested, `hasMoreMap` says whether older messages remain behind the cursor. They look interchangeable until a chat shorter than one page answers "nothing older" on its very first fetch — then "no history left" reads as "already loaded", and the chat stays blank forever. A failed fetch marks neither, so it retries on the next visit.
- **Generating is per chat, not per app.** `generatingChatIds` plus one `AbortController` per chat id (`client/src/App.tsx`), never a single global flag: the prompt bar belongs to the chat on screen, so with one flag it showed Stop in a conversation that was not generating and aborted the neighbour's request. Two chats may answer at once, which is only safe because of the write rule above. For the same reason `sendChatHistory` resolves the model and the reasoning level from the **target** chat, not from the active one.
- **The privacy policy and the terms live in the center column — not in a side panel, and not as a chat.** `client/src/views/LegalView.tsx` replaces `MessageView` inside `<main>` while `isLegalOpen` is true, and its only entry point is the consent checkbox of the sign-up form (`AccountView`). Both alternatives were tried and rejected: a side panel is 300px wide, which is unreadable for legal prose, and a chat belongs to the user — it can be renamed or deleted, and in Online Mode it would be stored per account in Mongo. Selecting or creating a chat closes it, otherwise clicking a conversation would look like a frozen app.
- **Production serving:** `server/app.js` serves `client/dist` as static files with a catch-all to `index.html` for the SPA — you must run `pnpm build` (client) before `pnpm start` reflects frontend changes in Online Mode.
