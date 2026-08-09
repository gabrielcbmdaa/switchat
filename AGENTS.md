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
- **Full Development Mode (Frontend + Backend):** `pnpm dev`
- **Development Mode (Frontend only - `http://localhost:5173`):** `pnpm dev:client`
- **Development Mode (Backend only - `http://localhost:3000`):** `pnpm dev:server`
- **Build the client:** `pnpm build`
- **Run the linter:** `pnpm lint`

> ⚠️ **Golden Rule:** **Always** use `pnpm` and its filters (`pnpm --filter client ...`). Do **NOT** use `npm` or `yarn`.

---

## 📂 3. Directory Structure

```text
switchat/
├── client/                     # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/         # Reusable components (Sidebar, SvgIcons, Toolbar...)
│   │   ├── config/             # Global configuration and constants
│   │   ├── services/           # API integration services (api.ts for online sync)
│   │   ├── utils/              # Helper functions (resizer, storage helpers, etc.)
│   │   ├── views/              # Main views (ChatView, MessageView, SettingsView, AccountView)
│   │   ├── App.tsx             # UI entry point and global state management
│   │   └── index.css           # Design tokens and global styles
├── server/                     # Node.js + Express 5 + Mongoose
│   ├── controllers/            # Logic controllers (authController, chatController, apiKeyController)
│   ├── middleware/             # Authorization middleware (authMiddleware)
│   ├── models/                 # Mongoose database models (User, Chat, Message, ApiKey)
│   ├── routes/                 # Express API routes (authRoutes, chatRoutes, apiKeyRoutes)
│   ├── services/               # Internal services (encryptionService: AES-256-GCM)
│   └── server.js               # Server startup and MongoDB connection
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

---

## 📝 7. Code, Commit and Security Conventions

- **English only — everything, everywhere.** Every single thing that lands in this repository is written in English: UI copy, error messages (client *and* server responses), code comments, JSDoc, identifiers, commit messages, console logs, and documentation. There is no "internal" text exempt from this: a comment is read by whoever comes next, and a server error message ends up in front of a user. The reason is not style, it is cost — a mixed-language codebase forces every reader to switch languages mid-file, and it makes it impossible to tell at a glance whether a Spanish string is a leftover note or a bug about to be shown in the UI. Talking to the user in Spanish in chat is fine; anything **written into the repo** is English.
  - **Legacy exception:** parts of the code still carry Spanish comments and error messages from before this rule. Do not launch a mass rewrite from an unrelated task, but whenever you touch a file, translate what you touch. New code has no excuse.
- **Strict TypeScript:** Keep explicit typing in `client/src/types.ts`. Avoid `any`.
- **Dual Sync:** If you change how chats or messages are stored, make sure it stays compatible with both `localStorage` (Offline) and `api.ts` (Online).
- **Commits:** Use **Conventional Commits** (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`).
- **Security:** NEVER modify or expose keys or secrets stored in `.secrets/` or `.env`.
- **Mandatory Verification:** Always run `pnpm build` and `pnpm lint` to verify your changes before declaring a task finished. There is no test suite (`pnpm test` is not configured); verification is `pnpm build` (client: `tsc -b` + `vite build`) and `pnpm lint` (client only — the server has no lint script).

---

## 🧠 8. Architecture: details that must not drift

- **`client/src/services/providers.ts` is the ONLY place that talks to AI providers.** Google Gemini, Anthropic, OpenAI, LM Studio and Ollama are implemented there and nowhere else. The server does not call any provider and must not start doing so again: a duplicated `server/services/providerService.js` used to exist and was deleted on purpose. Routing the request through the server bought the user nothing, and it actively broke the local providers — LM Studio and Ollama pointed at `127.0.0.1`, which in production is the VPS and not the user's machine. A local provider only works if the call leaves from the local machine. If you find yourself adding provider logic under `server/`, that is the signal that the solution belongs somewhere else.
- **The server is a custodian for API Keys, but never uses them.** `server/services/encryptionService.js` encrypts them with AES-256-GCM so they can sync across devices. Encrypting a credential and *exercising* one are different things: only the second would rebuild the path that was removed.
- **Syncing an API Key is opt-in, key by key.** `syncApiKeysWithServer` (`client/src/utils/apiKeys.ts`) **downloads but does not upload**; the only keys that go up are the ones present in `apiKeysLastSynced`, the snapshot of the account that the user edits with the per-row button. If you touch that path, the rule that cannot break is that no local change (saving, deleting, switching the active one) may add keys to the account on its own.
- **`client/src/config/models.config.ts` (`MODEL_REGISTRY`)** is the single source of truth for known model IDs, their provider, and their thinking levels/budgets. `providers.ts` derives the provider and the effective reasoning level from here — add new models here first.
- **Model, reasoning and system prompt are CHAT state, not global preferences.** They live on the `Chat` object (`client/src/types.ts`) and the server persists them in `server/models/Chat.js`. The intuitive move is to store them as a global setting in `localStorage`, and that is exactly what they must not be: `loadDefaultModel`/`saveDefaultModel` (`utils/modelPreferences.ts`) are only **the seed for new chats**, never the active model. Two consequences to respect when touching this: changing the model re-validates the level through `resolveReasoningLevel` (scales are not universal — `'none'` exists on some models and not on others), and chats created before this architecture do not carry the fields, so every reader must tolerate `undefined` and fall back instead of assuming a value.
- **Persistence order:** `localStorage` (`client/src/utils/storage.ts`) is always the first write and the fallback; syncing to the server (`client/src/services/api.ts`) is best-effort on top (see the `saveToLocalDisk` calls before `saveChatToServer`/`syncChatDraftToServer` in `App.tsx`). Keep this order when touching chat/message/draft handlers so the app keeps working fully offline.
- **Message pagination:** chats load with `messages: []` from `GET /api/chats`; the 6 most recent messages are fetched lazily when the chat is selected; older ones come through the cursor (`before`, ISO date) — see the `useEffect` and `handleLoadMoreMessages` in `client/src/App.tsx`, and `getMessages` in `server/controllers/chatController.js`.
- **Production serving:** `server/server.js` serves `client/dist` as static files with a catch-all to `index.html` for the SPA — you must run `pnpm build` (client) before `pnpm start` reflects frontend changes in Online Mode.
