# Playwright E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Playwright functional tests for user flows (task CRUD, navigation/filtering, project management) running against the Vite dev server with an in-memory repository instead of the Tauri SQLite backend.

**Architecture:** A second HTML entry point (`index.test.html`) bootstraps the React app with a `MemoryRepository` (pure JS implementation of `TodoRepository`) and a `window.__TAURI_INTERNALS__` stub, bypassing all Tauri runtime initialization. Playwright runs against `http://localhost:1420/index.test.html`.

**Tech Stack:** `@playwright/test`, Vite dev server (port 1420), React 19, Zustand, TypeScript.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/test-harness/MemoryRepository.ts` | Create | In-memory `TodoRepository` implementation |
| `src/test-harness/tauri-stubs.ts` | Create | Stubs `window.__TAURI_INTERNALS__` before any Tauri SDK calls |
| `src/test-harness/main.tsx` | Create | Test entry point — mounts app with MemoryRepository |
| `index.test.html` | Create | HTML page that loads the test harness |
| `src/App.tsx` | Modify | Export `AppContent` (add `export` keyword) |
| `src/components/layout/TaskList.tsx` | Modify | Add `aria-label` to the `+` (new task) button |
| `playwright.config.ts` | Create | Playwright configuration |
| `package.json` | Modify | Add `test:e2e` script |
| `.gitignore` | Modify | Ignore `test-results/` and `playwright-report/` |
| `tests/e2e/tasks.spec.ts` | Create | Task CRUD tests |
| `tests/e2e/navigation.spec.ts` | Create | Navigation & filtering tests |
| `tests/e2e/projects.spec.ts` | Create | Project management tests |

---

### Task 1: Install Playwright

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install Playwright and its test runner**

```bash
pnpm add -D @playwright/test
```

Expected: `@playwright/test` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Install the Chromium browser**

```bash
pnpm playwright install chromium
```

Expected: Chromium browser downloaded to the Playwright cache.

- [ ] **Step 3: Add generated directories to .gitignore**

Open `.gitignore` and append:

```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore
git commit -m "chore: install playwright"
```

---

### Task 2: Create MemoryRepository

**Files:**
- Create: `src/test-harness/MemoryRepository.ts`

This file implements every method of the `TodoRepository` interface using in-memory Maps. It is the only data source the test harness uses. `getSettings()` returns `{ notification_enabled: "false" }` to prevent `useOverdueNotifications` from calling Tauri notification APIs.

- [ ] **Step 1: Create the file**

Create `src/test-harness/MemoryRepository.ts` with the following content:

```ts
import type {
  CreateProjectInput,
  CreateTagInput,
  CreateTaskInput,
  Priority,
  Project,
  Tag,
  Task,
  TaskFilters,
} from "@/types";
import type { TodoRepository } from "@/db/repository";

function now(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

export class MemoryRepository implements TodoRepository {
  private tasks = new Map<string, Task>();
  private projects = new Map<string, Project>();
  private tags = new Map<string, Tag>();
  private settings = new Map<string, string>([
    ["notification_enabled", "false"],
  ]);
  private sortCounter = 0;

  // ── Tasks ────────────────────────────────────────────────────────────

  async getTasks(filters: TaskFilters = {}): Promise<Task[]> {
    let results = Array.from(this.tasks.values());

    // completed: undefined → non-completed only; true → all tasks
    if (filters.completed !== true) {
      results = results.filter((t) => t.completedAt === null);
    }

    if (filters.projectId !== undefined) {
      results = results.filter((t) => t.projectId === filters.projectId);
    }

    if (filters.priority) {
      results = results.filter((t) => t.priority === filters.priority);
    }

    if (filters.tagIds && filters.tagIds.length > 0) {
      results = results.filter((t) =>
        filters.tagIds!.some((id) => t.tags.some((tag) => tag.id === id)),
      );
    }

    if (filters.dueBefore) {
      results = results.filter(
        (t) => t.dueDate !== null && t.dueDate <= filters.dueBefore!,
      );
    }

    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const tagObjects: Tag[] = (input.tagIds ?? [])
      .map((id) => this.tags.get(id))
      .filter((t): t is Tag => t !== undefined);

    const task: Task = {
      id: uuid(),
      title: input.title,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      priority: (input.priority as Priority) ?? "none",
      dueDate: input.dueDate ?? null,
      completedAt: null,
      tags: tagObjects,
      sortOrder: ++this.sortCounter,
      createdAt: now(),
      updatedAt: now(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const tagObjects: Tag[] =
      patch.tagIds !== undefined
        ? (patch.tagIds ?? [])
            .map((tid) => this.tags.get(tid))
            .filter((t): t is Tag => t !== undefined)
        : task.tags;

    const updated: Task = {
      ...task,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description ?? null }),
      ...(patch.projectId !== undefined && { projectId: patch.projectId ?? null }),
      ...(patch.priority !== undefined && { priority: patch.priority as Priority }),
      ...(patch.dueDate !== undefined && { dueDate: patch.dueDate ?? null }),
      tags: tagObjects,
      updatedAt: now(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async completeTask(id: string): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    const updated = { ...task, completedAt: now(), updatedAt: now() };
    this.tasks.set(id, updated);
    return updated;
  }

  async uncompleteTask(id: string): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    const updated = { ...task, completedAt: null, updatedAt: now() };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async reorderTasks(orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const task = this.tasks.get(id);
      if (task) this.tasks.set(id, { ...task, sortOrder: index });
    });
  }

  // ── Projects ──────────────────────────────────────────────────────────

  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: uuid(),
      name: input.name,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: ++this.sortCounter,
      createdAt: now(),
      updatedAt: now(),
    };
    this.projects.set(project.id, project);
    return project;
  }

  async updateProject(
    id: string,
    patch: Partial<CreateProjectInput>,
  ): Promise<Project> {
    const project = this.projects.get(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const updated: Project = { ...project, ...patch, updatedAt: now() };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
    for (const [tid, task] of this.tasks) {
      if (task.projectId === id) {
        this.tasks.set(tid, { ...task, projectId: null });
      }
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────────

  async getTags(): Promise<Tag[]> {
    return Array.from(this.tags.values());
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    const tag: Tag = {
      id: uuid(),
      name: input.name,
      color: input.color ?? null,
    };
    this.tags.set(tag.id, tag);
    return tag;
  }

  async updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag> {
    const tag = this.tags.get(id);
    if (!tag) throw new Error(`Tag ${id} not found`);
    const updated: Tag = { ...tag, ...patch };
    this.tags.set(id, updated);
    return updated;
  }

  async deleteTag(id: string): Promise<void> {
    this.tags.delete(id);
  }

  // ── Settings ──────────────────────────────────────────────────────────

  async getSettings(): Promise<Record<string, string>> {
    return Object.fromEntries(this.settings);
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/test-harness/MemoryRepository.ts
git commit -m "test: add MemoryRepository for Playwright harness"
```

---

### Task 3: Create Tauri stubs

**Files:**
- Create: `src/test-harness/tauri-stubs.ts`

This module stubs `window.__TAURI_INTERNALS__` with a minimal implementation. It must be imported as the very first import in `main.tsx` so it executes before any Tauri SDK call.

- [ ] **Step 1: Create the file**

Create `src/test-harness/tauri-stubs.ts`:

```ts
// Sets up window.__TAURI_INTERNALS__ so the Tauri JS SDK doesn't throw
// when its modules are imported. Must be imported before any Tauri SDK usage.
declare global {
  interface Window {
    __TAURI_INTERNALS__: Record<string, unknown>;
  }
}

window.__TAURI_INTERNALS__ = {
  ipc: {
    postMessage: () => {},
  },
  metadata: {
    currentWindow: { label: "main" },
    windows: [],
    menus: {},
  },
  convertFileSrc: (path: string) => path,
  transformCallback: (
    _callback: (response: unknown) => void,
    _once: boolean,
  ) => Math.random(),
  invoke: () => Promise.resolve(null),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/test-harness/tauri-stubs.ts
git commit -m "test: add Tauri stubs for Playwright harness"
```

---

### Task 4: Export AppContent and create test entry point

**Files:**
- Modify: `src/App.tsx` (add `export` to `AppContent`)
- Create: `src/test-harness/main.tsx`
- Create: `index.test.html`

`AppContent` is the component that loads stores and renders `<AppShell />`. It is currently a module-local function. Adding `export` makes it importable by the test harness without duplicating its logic.

- [ ] **Step 1: Export AppContent from App.tsx**

In `src/App.tsx`, change line 19:

```ts
// Before:
function AppContent() {

// After:
export function AppContent() {
```

- [ ] **Step 2: Create src/test-harness/main.tsx**

```tsx
// tauri-stubs MUST be first — it sets window.__TAURI_INTERNALS__ before
// any other module that might call into the Tauri SDK.
import "./tauri-stubs";
import "./../../index.css";
import "@/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { AppContent } from "@/App";
import { MemoryRepository } from "./MemoryRepository";
import { setRepository } from "@/store/repository";
import { ThemeProvider } from "@/theme/ThemeProvider";

declare global {
  interface Window {
    __REPO__: MemoryRepository;
  }
}

const repo = new MemoryRepository();
window.__REPO__ = repo;
setRepository(repo);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2b: Add aria-label to the + button in TaskList.tsx**

In `src/components/layout/TaskList.tsx`, find the `<TaskForm>` trigger button in the header area (around line 299) and add `aria-label`:

```tsx
// Before:
<TaskForm projectId={formProjectId}>
  <button
    type="button"
    className="glass-stat flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
  >
    <Plus className="h-4 w-4" />
  </button>
</TaskForm>

// After:
<TaskForm projectId={formProjectId}>
  <button
    type="button"
    aria-label={t("task.new")}
    className="glass-stat flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
  >
    <Plus className="h-4 w-4" />
  </button>
</TaskForm>
```

`t("task.new")` = `"New task"`.

- [ ] **Step 3: Create index.test.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Usagi – Test Harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/test-harness/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Verify the harness renders**

Start the dev server: `pnpm dev`

Open a browser and navigate to `http://localhost:1420/index.test.html`.

Expected: The app renders (sidebar visible, task list visible, no error about database initialization).

If you see an error in the browser console about Tauri, check that `tauri-stubs.ts` is the first import in `main.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/test-harness/main.tsx index.test.html
git commit -m "test: add Playwright test harness entry point"
```

---

### Task 5: Configure Playwright

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create playwright.config.ts**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Add test:e2e script to package.json**

In `package.json`, add to the `scripts` object:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Run Playwright with an empty test dir to verify config**

```bash
mkdir -p tests/e2e
pnpm test:e2e
```

Expected output: `No tests found` or similar (0 tests run, no errors from the config itself).

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts package.json tests/
git commit -m "test: configure Playwright"
```

---

### Task 6: Write task CRUD tests

**Files:**
- Create: `tests/e2e/tasks.spec.ts`

Key selectors derived from the component source:
- Quick-add input: `page.getByLabel('Task title')` (from `aria-label={t("task.titlePlaceholder")}`)
- Task row: `page.locator('.task-row-animate').filter({ hasText: '<title>' })`
- Checkbox in row: `taskRow.getByRole('checkbox')`
- Task title button (to open detail): `taskRow.getByRole('button', { name: '<title>' })`
- Complete button in detail: `page.getByLabel('Mark complete')` / `page.getByLabel('Mark incomplete')`
- Delete button: `page.getByRole('button', { name: 'Delete task' })`

- [ ] **Step 1: Create tests/e2e/tasks.spec.ts**

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.test.html");
  // Wait for app to finish loading stores
  await expect(page.getByLabel("Task title")).toBeVisible();
});

test("creates a task via QuickAddTask", async ({ page }) => {
  await page.getByLabel("Task title").fill("Buy groceries");
  await page.keyboard.press("Enter");

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Buy groceries" }),
  ).toBeVisible();
});

test("input is cleared after creating a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Buy groceries");
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Task title")).toHaveValue("");
});

test("creates a task via TaskForm dialog", async ({ page }) => {
  await page.getByLabel("New task").click();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Task title").fill("Task from form");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Task from form" }),
  ).toBeVisible();
});

test("completes a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Walk the dog");
  await page.keyboard.press("Enter");

  const row = page.locator(".task-row-animate").filter({ hasText: "Walk the dog" });
  await row.getByRole("checkbox").click();

  // Task title gets line-through when completed
  await expect(row.getByRole("button", { name: "Walk the dog" })).toHaveClass(
    /line-through/,
  );
  await expect(row.getByRole("checkbox")).toBeChecked();
});

test("uncompletes a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Read a book");
  await page.keyboard.press("Enter");

  const row = page.locator(".task-row-animate").filter({ hasText: "Read a book" });
  await row.getByRole("checkbox").click(); // complete
  await row.getByRole("checkbox").click(); // uncomplete

  await expect(row.getByRole("button", { name: "Read a book" })).not.toHaveClass(
    /line-through/,
  );
  await expect(row.getByRole("checkbox")).not.toBeChecked();
});

test("deletes a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Task to delete");
  await page.keyboard.press("Enter");

  const row = page.locator(".task-row-animate").filter({ hasText: "Task to delete" });
  // Open task detail by clicking the title
  await row.getByRole("button", { name: "Task to delete" }).click();
  // Click delete
  await page.getByRole("button", { name: "Delete task" }).click();

  await expect(row).not.toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test:e2e tests/e2e/tasks.spec.ts
```

Expected: All 5 tests pass. If any fail, read the Playwright error output — it will show a screenshot of the failure. Common issues:
- If "Task title" label is not found: the harness didn't load — check browser console at `/index.test.html`
- If checkbox click doesn't register: the checkbox may be inside a portal — use `force: true` option

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tasks.spec.ts
git commit -m "test: add task CRUD E2E tests"
```

---

### Task 7: Write navigation and filtering tests

**Files:**
- Create: `tests/e2e/navigation.spec.ts`

Key selectors:
- "Today" nav item: `page.getByRole('button', { name: 'Today' })`
- "All tasks" nav item: `page.getByRole('button', { name: 'All tasks' })`
- Search input: `page.getByLabel('Search…')`
- Priority filter button: `page.getByRole('button', { name: 'Priority' })`
- Priority dropdown item: `page.getByRole('menuitem', { name: 'High' })`

For the "Today" view test, we need a task due today. The `MemoryRepository` is reset on each `page.goto()`, so we must create data through the UI or use `window.__REPO__` via `page.evaluate`.

Since `TaskForm` (the `+` button dialog) lets us set a due date, we'll use it. But to avoid complexity (finding the `+` button which has no aria-label), we'll use `page.evaluate` to seed data and then reload the stores.

The test harness exposes `window.__REPO__` and the Zustand stores are accessible via their exported hooks in the browser context. We expose a reload helper on `window`:

**Before writing the test file, add `window.__reloadStores` to the harness:**

- [ ] **Step 1: Update src/test-harness/main.tsx to expose store reload**

Replace `src/test-harness/main.tsx` with:

```tsx
import "./tauri-stubs";
import "./../../index.css";
import "@/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { AppContent } from "@/App";
import { MemoryRepository } from "./MemoryRepository";
import { setRepository } from "@/store/repository";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";

declare global {
  interface Window {
    __REPO__: MemoryRepository;
    __reloadStores: () => Promise<void>;
  }
}

const repo = new MemoryRepository();
window.__REPO__ = repo;
setRepository(repo);

window.__reloadStores = async () => {
  useUIStore.getState().setSelectedProject(undefined);
  const { loadProjects } = useProjectStore.getState();
  const { loadTags } = useTagStore.getState();
  const { loadTasks } = useTaskStore.getState();
  await Promise.all([loadProjects(repo), loadTags(repo)]);
  await loadTasks(repo, {});
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Create tests/e2e/navigation.spec.ts**

```ts
import { expect, test } from "@playwright/test";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/index.test.html");
  await expect(page.getByLabel("Task title")).toBeVisible();
});

test("All tasks view shows tasks from all projects", async ({ page }) => {
  // Create two tasks
  await page.getByLabel("Task title").fill("Task Alpha");
  await page.keyboard.press("Enter");
  await page.getByLabel("Task title").fill("Task Beta");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "All tasks" }).click();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Task Alpha" }),
  ).toBeVisible();
  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Task Beta" }),
  ).toBeVisible();
});

test("search filters task list in real time", async ({ page }) => {
  await page.getByLabel("Task title").fill("Alpha task");
  await page.keyboard.press("Enter");
  await page.getByLabel("Task title").fill("Beta task");
  await page.keyboard.press("Enter");

  await page.getByLabel("Search…").fill("Alpha");

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Alpha task" }),
  ).toBeVisible();
  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Beta task" }),
  ).not.toBeVisible();
});

test("search shows all tasks when cleared", async ({ page }) => {
  await page.getByLabel("Task title").fill("Alpha task");
  await page.keyboard.press("Enter");
  await page.getByLabel("Task title").fill("Beta task");
  await page.keyboard.press("Enter");

  await page.getByLabel("Search…").fill("Alpha");
  await page.getByLabel("Search…").clear();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Beta task" }),
  ).toBeVisible();
});

test("priority filter shows only matching tasks", async ({ page }) => {
  // Seed via window.__REPO__ + reload stores
  await page.evaluate(async () => {
    await window.__REPO__.createTask({ title: "High priority task", priority: "high" });
    await window.__REPO__.createTask({ title: "Low priority task", priority: "low" });
    await window.__reloadStores();
  });

  await page.getByRole("button", { name: "Priority" }).click();
  await page.getByRole("menuitem", { name: "High" }).click();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "High priority task" }),
  ).toBeVisible();
  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Low priority task" }),
  ).not.toBeVisible();
});

test("Today view shows only tasks due today", async ({ page }) => {
  await page.evaluate(async () => {
    const today = new Date().toISOString().slice(0, 10);
    await window.__REPO__.createTask({ title: "Due today task", dueDate: today });
    await window.__REPO__.createTask({ title: "No due date task" });
    await window.__reloadStores();
  });

  await page.getByRole("button", { name: "Today" }).click();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Due today task" }),
  ).toBeVisible();
  await expect(
    page.locator(".task-row-animate").filter({ hasText: "No due date task" }),
  ).not.toBeVisible();
});

test("selecting a project shows only its tasks", async ({ page }) => {
  await page.evaluate(async () => {
    const project = await window.__REPO__.createProject({
      name: "Work",
      color: "#3b82f6",
      icon: "Folder",
    });
    await window.__REPO__.createTask({
      title: "Work task",
      projectId: project.id,
    });
    await window.__REPO__.createTask({ title: "Inbox task", projectId: null });
    await window.__reloadStores();
  });

  await page.getByRole("button", { name: "Work" }).click();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Work task" }),
  ).toBeVisible();
  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Inbox task" }),
  ).not.toBeVisible();
});
```

- [ ] **Step 3: Run the tests**

```bash
pnpm test:e2e tests/e2e/navigation.spec.ts
```

Expected: All 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/test-harness/main.tsx tests/e2e/navigation.spec.ts
git commit -m "test: add navigation and filtering E2E tests"
```

---

### Task 8: Write project management tests

**Files:**
- Create: `tests/e2e/projects.spec.ts`

Key selectors:
- New project button in sidebar: `page.getByLabel('New project')` (from `aria-label={t("project.new")}`)
- Project name input in dialog: `page.getByPlaceholder('Project name')`
- Create button: `page.getByRole('button', { name: 'Create' })`
- Save button (edit): `page.getByRole('button', { name: 'Save' })`
- Project options button: `page.getByLabel('Project options')` (from `aria-label={t("project.options")}`)
- Edit menu item: `page.getByRole('menuitem', { name: 'Edit' })` (contains text "Edit")
- Delete menu item: `page.getByRole('menuitem', { name: 'Delete' })`

Note: The project options button (···) is only visible on hover. Use `hover()` first.

- [ ] **Step 1: Create tests/e2e/projects.spec.ts**

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.test.html");
  await expect(page.getByLabel("Task title")).toBeVisible();
});

test("creates a project", async ({ page }) => {
  await page.getByLabel("New project").click();
  await page.getByPlaceholder("Project name").fill("My Project");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(
    page.getByRole("button", { name: "My Project" }),
  ).toBeVisible();
});

test("renames a project", async ({ page }) => {
  await page.getByLabel("New project").click();
  await page.getByPlaceholder("Project name").fill("Old Name");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: "Old Name" })).toBeVisible();

  // Hover to reveal the options button
  const projectNavItem = page.locator("button", { hasText: "Old Name" });
  await projectNavItem.hover();
  await page.getByLabel("Project options").click();
  await page.getByRole("menuitem").filter({ hasText: "Edit" }).click();

  await page.getByPlaceholder("Project name").clear();
  await page.getByPlaceholder("Project name").fill("New Name");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: "New Name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Old Name" })).not.toBeVisible();
});

test("deletes a project", async ({ page }) => {
  await page.getByLabel("New project").click();
  await page.getByPlaceholder("Project name").fill("Temp Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: "Temp Project" })).toBeVisible();

  const projectNavItem = page.locator("button", { hasText: "Temp Project" });
  await projectNavItem.hover();
  await page.getByLabel("Project options").click();
  await page.getByRole("menuitem").filter({ hasText: "Delete" }).click();

  await expect(
    page.getByRole("button", { name: "Temp Project" }),
  ).not.toBeVisible();
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test:e2e tests/e2e/projects.spec.ts
```

Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/projects.spec.ts
git commit -m "test: add project management E2E tests"
```

---

### Task 9: Run the full suite

**Files:** none

- [ ] **Step 1: Run all E2E tests**

```bash
pnpm test:e2e
```

Expected: 15 tests pass across 3 spec files (6 tasks + 6 navigation + 3 projects).

- [ ] **Step 2: If any test fails, open the Playwright report**

```bash
pnpm playwright show-report
```

The HTML report shows screenshots and traces for failing tests. Use them to diagnose selector issues.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "test: fix E2E test selectors"
```
