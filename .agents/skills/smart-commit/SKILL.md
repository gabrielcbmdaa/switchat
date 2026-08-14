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
  - `ci`: Changes to the continuous integration setup (`.github/workflows/`), including the auto-deploy pipeline

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
- **A blank line between the header and the first bullet is MANDATORY.** Git has no other way to tell where the subject ends: without it the whole message becomes one giant subject line, and `git log --oneline`, `git shortlog` and GitHub's PR titles all render the bullets glued to the header. This is the single easiest rule to get wrong — see the verification step in section 3.
- Bullet points MUST start with `* ` (asterisk followed by space).
- Each bullet point starts with a **lowercase verb** in imperative mood (e.g., `* add support for...`, `* implement interactive...`, `* clean up unused CSS...`).
- Each bullet point MUST end with a **period `.`**.

#### Writing the message safely
Passing several `-m` flags is the safest way to get the blank line right, because git inserts it between each one:
```bash
git commit -m "feat(client): add retry button to failed messages." -m "* add a retry action to MessageBubble.
* re-send the trimmed history from the failing user message."
```
If you instead pipe a heredoc into `git commit -F -`, the blank line must be typed explicitly — nothing adds it for you.

---

## 2. Examples from Repository History

### Example 1 (Header only for concise changes):
```
refactor(client): use providers module in fetchChatResponse, clean and reorganize api.ts.
```

### Example 2 (Header + detailed body for multi-file / multi-feature changes):
Note the blank line after the header — it is part of the format, not spacing in this document.
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

### No AI co-authors (required)

- **NEVER** add `Co-authored-by` (or similar) trailers for AI tools or agents — including Claude, Claude Code, Cursor, Copilot, ChatGPT, or any other assistant.
- GitHub treats those trailers as real contributors and lists them on the repo Contributors sidebar.
- The commit author must be the human user only (`user.name` / `user.email`).
- After committing, verify with `git log -1 --format=full` (or `git cat-file -p HEAD`) that the message has **no** `Co-authored-by` / `Co-Authored-By` lines. If a tool injected one, strip it before pushing (e.g. recreate the commit with `git commit-tree` / amend without the trailer).

When requested to create a commit, ALWAYS follow these exact steps:

1. **Inspect status**: Run `git status` to identify all changed, untracked, or deleted files.
2. **Inspect diff**: Run `git diff` (and `git diff --cached` if any files are staged) to inspect all exact code changes.
3. **Draft commit message**: Draft the commit message according to the rules above (keeping header close to ~89 chars). Do **not** include any AI `Co-authored-by` trailer in the draft.
4. **Print the message**: Display the complete commit message (header + optional body) so it lands in the transcript. Do **not** wait for approval — print it and move on. Nothing here is a gate: an unpushed commit is cheap to fix with `git commit --amend`, and stopping to ask on every commit would stall an implementation plan that commits after each task.
5. **Execute commit**: Stage the relevant files using `git add` and run `git commit` with that exact message (no AI co-author trailers).
6. **Verify**: Run `git log -n 1 --format=full` to verify the commit message format **and** confirm there is no `Co-authored-by` line.
7. **Verify the subject line did not swallow the body**: run `git log --oneline -1`. It must print **only the header**. If the bullets show up on that line, the blank line after the header is missing — fix it right away with `git commit --amend` (before the commit is pushed and before any further commit is stacked on top of it, which would force rewriting those too).

### Repairing badly formatted messages already committed

- **Last commit, not yet pushed** → `git commit --amend`.
- **Several local commits, none pushed** → rewriting is safe, but remember every descendant gets a new hash, so the whole unpushed range is rebuilt. `git rebase -i <base>` with `reword` is the idiomatic tool.
- **Already pushed to `origin`** → **leave it alone.** Fixing a blank line is never worth a force-push that rewrites shared history.

To find affected commits, use the fact that `%s` (the subject) absorbs the body when the blank line is missing:
```bash
git log --format='%h %s' origin/main..HEAD | grep '\* '   # unpushed ones, safe to fix
```
