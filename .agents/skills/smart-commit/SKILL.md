---
name: smart-commit
description: Creates git commits following the project's commit message style convention. Use this skill whenever generating git commit messages or staging and committing changes automatically.
---

# Smart Commit Skill

This skill defines the exact commit message conventions used in this project and provides step-by-step instructions for staging files and committing changes.

## 1. Commit Message Structure Guidelines

All commit messages MUST follow the Conventional Commits format with the specific project style rules below:

### Header Format
`<type>(<scope>): <short summary>.`

- **`<type>`**: Must be one of:
  - `feat`: A new feature (adds brand new user-facing or system capabilities that didn't exist before)
  - `fix`: A bug fix (corrects broken behavior or fixes an error)
  - `refactor`: A code change that reorganizes, modularizes, or cleans existing code without changing external behavior or adding new features (e.g. moving logic into a service module)
  - `style`: Changes that do not affect the meaning of the code (formatting, CSS tweaks, whitespace)
  - `chore`: Maintenance, updates to build process, configs, or dependencies
  - `docs`: Documentation only changes
  - `test`: Adding or updating tests
  - `perf`: A code change that improves performance

> **Choosing between `feat` vs `refactor`**:
> - Use `feat` when introducing new end-user functionality or new core API capabilities that expand what the app can do.
> - Use `refactor` when restructuring, modularizing, or extracting code (like moving logic from a monolithic controller into a dedicated service file) even if creating new files, provided the primary goal is improving code architecture and maintainability.

- **`<scope>`**: Optional. Only two scopes are allowed: `client` or `server`.
  - Use `(client)` if changes are strictly within the `client/` directory.
  - Use `(server)` if changes are strictly within the `server/` directory.
  - **Omit the scope completely** (i.e. `<type>: <short summary>.`) if changes affect BOTH `client` and `server`, or if changes are outside those directories (e.g. root files, `.agents/`, root configs).
- **`<short summary>`**: 
  - Written in **English**.
  - Starts with a **lowercase letter** immediately after the colon and space (e.g., `feat(client): add retry button...` or `chore: add smart-commit skill.`).
  - Ends with a **period `.`**.
  - Uses imperative mood (e.g., `use`, `add`, `redesign`, `create`, `remove`).
  - **Header Length Guideline**: Target length for the header line is around **89 characters** (project average across recent 30 commits). Aim to keep header lines concise (around 80–90 chars) and avoid exceeding ~100 characters.

### Body Format (Optional for simple changes, Required for multi-file / complex changes)
Leave one blank line after the header, then list details using bullet points:
- Bullet points MUST start with `* ` (asterisk followed by space).
- Each bullet point starts with a **lowercase verb** in imperative mood (e.g., `* add support for...`, `* implement interactive...`, `* clean up unused CSS...`).
- Each bullet point MUST end with a **period `.`**.

---

## 2. Examples from Repository History

### Example 1 (Header only for concise changes):
```
refactor(client): use providers module in fetchChatResponse, clean and reorganize api.ts.
```

### Example 2 (Header + detailed body for multi-file / multi-feature changes):
```
feat(client): redesign API key management flow and UI.
* add support for saving and managing multiple API keys per provider.
* implement interactive API key list with an active status indicator.
* add optional viewBox prop support to DefaultButton component.
* reorganize and clean up SettingsView.module.css.
```

### Example 3:
```
refactor(client): simplify model selector to inline list with search input.
* remove local model storage persistence and save/delete actions.
* remove live Google models fetching logic on API key save.
* render model list inline permanently with a sticky top search bar.
* clean up unused CSS classes.
```

---

## 3. Mandatory Commit Workflow & Rules

When requested to create a commit, ALWAYS follow these exact steps:

1. **Inspect status**: Run `git status` to identify all changed, untracked, or deleted files.
2. **Inspect diff**: Run `git diff` (and `git diff --cached` if any files are staged) to inspect all exact code changes.
3. **Draft commit message**: Draft the commit message according to the rules above (keeping header close to ~89 chars).
4. **MANDATORY PRE-COMMIT PREVIEW & CONFIRMATION**:
   - **DO NOT** execute `git commit` immediately.
   - Display the complete proposed commit message (header + optional body) to the user first.
   - Ask for explicit user confirmation.
5. **Execute commit**: ONLY after receiving explicit user confirmation/approval, stage the relevant files using `git add` and run `git commit`.
6. **Verify**: Run `git log -n 1` to verify the commit message format.
