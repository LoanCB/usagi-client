---
date: 2026-05-14
scope: Playwright functional tests — user flows
out_of_scope: drag & drop, CI pipeline, tauri-driver
---

# Playwright E2E Tests — Design Spec

## Context

The project is a Tauri desktop app (React 19 + Vite + Zustand). Unit tests already exist via Vitest + Testing Library. This spec covers functional tests for user flows using Playwright against the Vite dev server, with no dependency on the Tauri runtime.

The `TodoRepository` interface (`src/db/repository.ts`) is already cleanly abstracted, making it straightforward to swap the SQLite implementation for an in-memory one in tests.

---

## Architecture

A second HTML entry point (`index.test.html`) is served by Vite. Playwright navigates to this page instead of the normal `index.html`. The test harness mounts the React app with a `MemoryRepository` directly, bypassing the Tauri `Database.load()` initialization in `App.tsx`.

```
index.test.html
  └─ src/test-harness/main.tsx
       ├─ stubs window.__TAURI_INTERNALS__ (before any Tauri imports)
       ├─ initializes MemoryRepository
       ├─ calls setRepository()
       └─ renders <AppContent /> (reused as-is from App.tsx)

playwright.config.ts
  └─ webServer: pnpm dev (port 1420)
  └─ baseURL: http://localhost:1420

tests/e2e/
  ├─ tasks.spec.ts
  ├─ navigation.spec.ts
  └─ projects.spec.ts
```

**One minimal production change:** `AppContent` in `App.tsx` needs `export` added (it is currently a module-local function). This is a one-word, non-breaking change that lets `main.tsx` import and reuse it without duplication. All other production files remain untouched.

---

## Files to Create

### `src/test-harness/MemoryRepository.ts`

Implements `TodoRepository` in pure JS using `Map` and arrays. Data lives in memory and resets on every page reload (each test calls `page.goto('/')` for a clean state).

- **IDs**: `crypto.randomUUID()`
- **`sortOrder`**: incremental counter, mirroring SQLite `ROWID` behavior
- **`reorderTasks`**: updates `sortOrder` on each task so subsequent `getTasks()` returns them in the new order
- **`getTasks(filters)`**: applies `projectId`, `dueBefore`, tag, priority filters in JS
- **Window exposure**: `window.__REPO__` exposes the instance for Playwright `page.evaluate()` seeding

```ts
// Seeding example in a test
await page.evaluate(async () => {
  await window.__REPO__.createProject({
    name: "Perso",
    color: "#3b82f6",
    icon: "folder",
  });
});
```

### `src/test-harness/main.tsx`

Bootstraps the app for test mode:

1. Stubs `window.__TAURI_INTERNALS__` as an empty object (prevents Tauri SDK from throwing when it checks for the runtime)
2. Instantiates `MemoryRepository` and exposes it on `window.__REPO__`
3. Calls `setRepository(repo)` from `src/store/repository.ts`
4. Directly renders `<ThemeProvider><AppContent /></ThemeProvider>` (skips the Tauri init phase of `App.tsx`)

### `index.test.html`

Copy of `index.html` with the script `src` changed to `src/test-harness/main.tsx`.

### `playwright.config.ts`

```ts
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
  },
});
```

- Single browser (chromium) — sufficient for local tests
- `reuseExistingServer: true` locally so Playwright attaches to an already-running dev server
- `trace: 'on-first-retry'` to capture diagnostics only on failure
- `baseURL` is the origin only — tests navigate to `/index.test.html` explicitly
- Vite dev server runs on port **1420** (configured in `vite.config.ts`)

Add `"test:e2e": "playwright test"` to `package.json` scripts.

---

## Test Scenarios

### `tests/e2e/tasks.spec.ts` — Task CRUD

| Scenario                | Steps                                 | Assertion                            |
| ----------------------- | ------------------------------------- | ------------------------------------ |
| Create via QuickAddTask | Type title + Enter in quick-add input | Task appears in list                 |
| Create via TaskForm     | Click + button, fill form, submit     | Task appears with correct attributes |
| Complete a task         | Click task checkbox                   | Task is visually marked complete     |
| Uncomplete a task       | Click checkbox again                  | Task returns to pending state        |
| Delete a task           | Open task detail, click Delete        | Task is removed from list            |

### `tests/e2e/navigation.spec.ts` — Navigation & Filtering

| Scenario         | Steps                      | Assertion                               |
| ---------------- | -------------------------- | --------------------------------------- |
| "Today" view     | Click Today in sidebar     | Only tasks due today are shown          |
| "All Tasks" view | Click All Tasks            | All tasks visible regardless of project |
| Select a project | Click a project in sidebar | Only that project's tasks shown         |
| Search           | Type in Search input       | List filters in real time               |
| Priority filter  | Click a priority filter    | Only matching tasks shown               |

### `tests/e2e/projects.spec.ts` — Project Management

| Scenario       | Steps                             | Assertion                     |
| -------------- | --------------------------------- | ----------------------------- |
| Create project | Click +, enter name, confirm      | Project appears in sidebar    |
| Rename project | Open ··· menu → Edit, change name | Updated name shown in sidebar |
| Delete project | Open ··· menu → Delete            | Project removed from sidebar  |

---

## Conventions

- Each test starts with `page.goto('/index.test.html')` for a guaranteed clean `MemoryRepository` state
- Seed test data via `page.evaluate()` on `window.__REPO__` rather than driving the UI when setup is incidental to what's being tested
- Selectors: prefer `aria-label` and visible text over CSS classes (resilient to styling changes)
- No `page.waitForTimeout()` — use `page.waitForSelector()` or Playwright's built-in auto-waiting
