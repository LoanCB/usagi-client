# Usagi TODO App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform local-first TODO app (Tauri + React + TypeScript + SQLite) with a sync-ready repository pattern architecture.

**Architecture:** 4-layer architecture — UI components read from Zustand stores, stores delegate all persistence to a `TodoRepository` interface, implemented today by `SqliteRepository` (via `tauri-plugin-sql`). The theme system uses CSS custom properties aligned with shadcn/ui tokens. Adding ElectricSQL later means implementing one new class and changing one line in the factory.

**Tech Stack:** Tauri 2, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, tauri-plugin-sql, Vitest, @testing-library/react

---

## File Map

Files to create, grouped by responsibility:

```
src/
├── types/index.ts                    # All shared TS types (Task, Project, Tag, inputs, filters)
├── lib/utils.ts                      # cn(), formatDate()
│
├── db/
│   ├── driver.ts                     # DbDriver interface (testability shim for tauri-plugin-sql)
│   ├── repository.ts                 # TodoRepository interface
│   ├── sqlite-repository.ts          # SqliteRepository implements TodoRepository
│   ├── index.ts                      # createRepository() factory
│   └── migrations/001_initial.sql    # Full schema (idempotent, CREATE TABLE IF NOT EXISTS)
│
├── store/
│   ├── tasks.ts                      # Zustand TaskStore
│   ├── projects.ts                   # Zustand ProjectStore
│   ├── tags.ts                       # Zustand TagStore
│   └── ui.ts                         # Zustand UIStore (layout state, selections, filters)
│
├── theme/
│   ├── types.ts                      # ThemeTokens interface, ThemeMode type
│   ├── themes/light.ts               # Light theme tokens
│   ├── themes/dark.ts                # Dark theme tokens
│   └── ThemeProvider.tsx             # Applies tokens to :root, watches prefers-color-scheme
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx              # 3-column grid, top-level layout
│   │   ├── Sidebar.tsx               # Collapsible sidebar with SmartLists + ProjectList
│   │   ├── TaskList.tsx              # Middle column: header + filter bar + task items
│   │   └── TaskDetail.tsx            # Right column: full task editor
│   └── tasks/
│       ├── TaskItem.tsx              # Single row in task list (checkbox, title, badges)
│       ├── TaskForm.tsx              # Dialog for quick task creation
│       ├── FilterBar.tsx             # Priority/tag/date filter dropdowns
│       ├── PrioritySelector.tsx      # Dropdown for picking priority
│       ├── DueDatePicker.tsx         # Popover + Calendar for date selection
│       └── TagSelector.tsx           # Popover multi-select for tags
│
├── test/
│   └── setup.ts                      # Vitest global setup (@testing-library/jest-dom)
│
├── App.tsx                           # DB init, repository wiring, ThemeProvider wrapper
└── main.tsx                          # React entry point (unchanged from scaffold)

src-tauri/
├── src/lib.rs                        # Register tauri-plugin-sql
├── Cargo.toml                        # Add tauri-plugin-sql dependency
└── capabilities/default.json         # Add SQL permissions
```

---

## Task 1: Project scaffold

**Files:**
- Create: project root (via `create-tauri-app`)
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `vite.config.ts`

- [ ] **Step 1.1: Scaffold the app**

In `/home/loan/Projects/perso/usagi`, run the interactive Tauri scaffolder. Choose **React + TypeScript (Vite)** and **pnpm** as package manager.

```bash
cd /home/loan/Projects/perso/usagi
pnpm create tauri-app@latest . -- --template react-ts --manager pnpm --identifier com.usagi.app --app-name usagi
```

If the `--` flags are not accepted, run `pnpm create tauri-app@latest .` interactively and select React TypeScript + pnpm.

- [ ] **Step 1.2: Install base JS dependencies**

```bash
pnpm install
pnpm add zustand @tauri-apps/plugin-sql
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 1.3: Add Tailwind CSS v4**

```bash
pnpm add tailwindcss @tailwindcss/vite
```

Replace the contents of `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

Add `"types": ["vitest/globals"]` to `tsconfig.json` under `compilerOptions`, and add path alias:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals"]
  }
}
```

- [ ] **Step 1.4: Init shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

Accept the defaults. This generates `components.json` and sets up `src/components/ui/` and the CSS variables in `src/index.css`.

- [ ] **Step 1.5: Add tauri-plugin-sql to Rust**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

- [ ] **Step 1.6: Register the SQL plugin in lib.rs**

Replace `src-tauri/src/lib.rs` with:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 1.7: Add SQL capabilities**

Replace `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-load",
    "sql:allow-close"
  ]
}
```

- [ ] **Step 1.8: Create Vitest setup file**

Create `src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 1.9: Verify dev build runs**

```bash
pnpm tauri dev
```

Expected: app window opens with the default Tauri + React template. Close it after confirming.

- [ ] **Step 1.10: Verify tests run**

```bash
pnpm vitest run
```

Expected: no test files found yet — exit 0 (or a "no tests" notice, not an error).

---

## Task 2: Core TypeScript types

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/utils.ts`

- [ ] **Step 2.1: Write types**

Create `src/types/index.ts`:

```typescript
export type Priority = "none" | "low" | "medium" | "high";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface Task {
  id: string;
  title: string;
  projectId: string | null;
  priority: Priority;
  dueDate: string | null;       // ISO 8601 date string
  completedAt: string | null;   // ISO 8601 datetime, null = not completed
  tags: Tag[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskFilters {
  projectId?: string | null;  // null = Inbox, undefined = all projects
  tagIds?: string[];
  priority?: Priority;
  completed?: boolean;        // undefined = non-completed only (default)
  dueBefore?: string;         // ISO date, inclusive
}

export interface CreateTaskInput {
  title: string;
  projectId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  tagIds?: string[];
}

export interface CreateProjectInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}
```

- [ ] **Step 2.2: Write utils**

Create `src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format ISO date string to locale-friendly short date ("Apr 12")
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// Returns true if the ISO date is today or in the past
export function isOverdue(isoDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(isoDate) < today;
}

// Today's date as ISO date string ("2026-04-10")
export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}
```

Install dependencies used by shadcn (may already be installed by `shadcn init`):
```bash
pnpm add clsx tailwind-merge
```

---

## Task 3: Database schema

**Files:**
- Create: `src/db/migrations/001_initial.sql`

No tests — this is a SQL file run at startup.

- [ ] **Step 3.1: Write the migration**

Create `src/db/migrations/001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  project_id   TEXT REFERENCES projects(id),
  priority     TEXT DEFAULT 'none'
                 CHECK(priority IN ('none', 'low', 'medium', 'high')),
  due_date     TEXT,
  completed_at TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id  TEXT NOT NULL REFERENCES tasks(id),
  tag_id   TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at  ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
```

---

## Task 4: Repository interface & DbDriver

**Files:**
- Create: `src/db/driver.ts`
- Create: `src/db/repository.ts`
- Create: `src/db/index.ts`

- [ ] **Step 4.1: Write the DbDriver interface**

This thin interface lets tests inject a mock instead of importing the real Tauri plugin.

Create `src/db/driver.ts`:

```typescript
export interface QueryResult {
  rowsAffected: number;
  lastInsertId: number;
}

export interface DbDriver {
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}
```

- [ ] **Step 4.2: Write the TodoRepository interface**

Create `src/db/repository.ts`:

```typescript
import type {
  Task,
  Project,
  Tag,
  TaskFilters,
  CreateTaskInput,
  CreateProjectInput,
  CreateTagInput,
} from "@/types";

export interface TodoRepository {
  // Tasks
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task>;
  completeTask(id: string): Promise<Task>;
  uncompleteTask(id: string): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Projects
  getProjects(): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<CreateProjectInput>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Tags
  getTags(): Promise<Tag[]>;
  createTag(input: CreateTagInput): Promise<Tag>;
  updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
}
```

- [ ] **Step 4.3: Write the factory (stub)**

Create `src/db/index.ts` — we'll complete this once `SqliteRepository` exists:

```typescript
import type { DbDriver } from "./driver";
import type { TodoRepository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";

export { TodoRepository } from "./repository";

export function createRepository(db: DbDriver): TodoRepository {
  return new SqliteRepository(db);
}
```

---

## Task 5: SqliteRepository — projects & tags

**Files:**
- Create: `src/db/sqlite-repository.ts`
- Create: `src/db/sqlite-repository.test.ts`

- [ ] **Step 5.1: Write the failing tests for projects**

Create `src/db/sqlite-repository.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SqliteRepository } from "./sqlite-repository";
import type { DbDriver } from "./driver";

function makeDb(overrides: Partial<DbDriver> = {}): DbDriver {
  return {
    execute: vi.fn().mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 }),
    select: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("SqliteRepository — projects", () => {
  it("createProject inserts a row and returns a Project", async () => {
    const db = makeDb({
      select: vi.fn()
        // First call: getProject after insert
        .mockResolvedValueOnce([
          {
            id: "proj-1",
            name: "Boulot",
            color: "#6366f1",
            icon: "💼",
            sort_order: 0,
            created_at: "2026-04-10T10:00:00.000Z",
            updated_at: "2026-04-10T10:00:00.000Z",
          },
        ]),
    });
    const repo = new SqliteRepository(db);
    const project = await repo.createProject({ name: "Boulot", color: "#6366f1", icon: "💼" });
    expect(project.name).toBe("Boulot");
    expect(project.color).toBe("#6366f1");
    expect(typeof project.id).toBe("string");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("getProjects returns only non-deleted rows, mapped to Project", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "p1", name: "A", color: null, icon: null, sort_order: 0, created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T10:00:00.000Z" },
        { id: "p2", name: "B", color: "#f00", icon: "🚀", sort_order: 1, created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T10:00:00.000Z" },
      ]),
    });
    const repo = new SqliteRepository(db);
    const projects = await repo.getProjects();
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({ id: "p1", name: "A" });
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("deleteProject sets deleted_at (soft delete)", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.deleteProject("proj-1");
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at");
    expect(params).toContain("proj-1");
  });
});

describe("SqliteRepository — tags", () => {
  it("createTag inserts a row and returns a Tag", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "tag-1", name: "urgent", color: "#f00", created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T10:00:00.000Z" },
      ]),
    });
    const repo = new SqliteRepository(db);
    const tag = await repo.createTag({ name: "urgent", color: "#f00" });
    expect(tag.name).toBe("urgent");
    expect(tag.color).toBe("#f00");
  });

  it("getTags returns only non-deleted rows", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "t1", name: "work", color: null },
      ]),
    });
    const repo = new SqliteRepository(db);
    const tags = await repo.getTags();
    expect(tags).toHaveLength(1);
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at IS NULL");
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
pnpm vitest run src/db/sqlite-repository.test.ts
```

Expected: **FAIL** — `SqliteRepository` does not exist yet.

- [ ] **Step 5.3: Implement SqliteRepository (projects & tags only)**

Create `src/db/sqlite-repository.ts`:

```typescript
import type { DbDriver } from "./driver";
import type { TodoRepository } from "./repository";
import type {
  Task,
  Project,
  Tag,
  TaskFilters,
  CreateTaskInput,
  CreateProjectInput,
  CreateTagInput,
} from "@/types";

// ---- Row types returned by SQLite (snake_case) ----

interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: string;
  name: string;
  color: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  project_id: string | null;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TaskTagRow {
  task_id: string;
  tag_id: string;
  name: string;
  color: string | null;
}

// ---- Mappers ----

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, color: row.color };
}

function mapTask(row: TaskRow, tags: Tag[]): Task {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    priority: row.priority as Task["priority"],
    dueDate: row.due_date,
    completedAt: row.completed_at,
    tags,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- Repository ----

export class SqliteRepository implements TodoRepository {
  constructor(private db: DbDriver) {}

  // ---------- Projects ----------

  async getProjects(): Promise<Project[]> {
    const rows = await this.db.select<ProjectRow>(
      "SELECT id, name, color, icon, sort_order, created_at, updated_at FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, created_at"
    );
    return rows.map(mapProject);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO projects (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [id, input.name, input.color ?? null, input.icon ?? null, now, now]
    );
    return (await this._getProject(id))!;
  }

  async updateProject(id: string, patch: Partial<CreateProjectInput>): Promise<Project> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if ("name" in patch) { sets.push("name = ?"); params.push(patch.name); }
    if ("color" in patch) { sets.push("color = ?"); params.push(patch.color ?? null); }
    if ("icon" in patch) { sets.push("icon = ?"); params.push(patch.icon ?? null); }
    params.push(id);
    await this.db.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, params);
    return (await this._getProject(id))!;
  }

  async deleteProject(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  }

  private async _getProject(id: string): Promise<Project | null> {
    const rows = await this.db.select<ProjectRow>(
      "SELECT id, name, color, icon, sort_order, created_at, updated_at FROM projects WHERE id = ?",
      [id]
    );
    return rows[0] ? mapProject(rows[0]) : null;
  }

  // ---------- Tags ----------

  async getTags(): Promise<Tag[]> {
    const rows = await this.db.select<TagRow>(
      "SELECT id, name, color FROM tags WHERE deleted_at IS NULL ORDER BY name"
    );
    return rows.map(mapTag);
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, input.name, input.color ?? null, now, now]
    );
    return (await this._getTag(id))!;
  }

  async updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if ("name" in patch) { sets.push("name = ?"); params.push(patch.name); }
    if ("color" in patch) { sets.push("color = ?"); params.push(patch.color ?? null); }
    params.push(id);
    await this.db.execute(`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`, params);
    return (await this._getTag(id))!;
  }

  async deleteTag(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  }

  private async _getTag(id: string): Promise<Tag | null> {
    const rows = await this.db.select<TagRow>(
      "SELECT id, name, color FROM tags WHERE id = ?",
      [id]
    );
    return rows[0] ? mapTag(rows[0]) : null;
  }

  // ---------- Tasks (stubbed — implemented in Task 6) ----------

  async getTasks(_filters?: TaskFilters): Promise<Task[]> { return []; }
  async getTask(_id: string): Promise<Task | null> { return null; }
  async createTask(_input: CreateTaskInput): Promise<Task> { throw new Error("Not implemented"); }
  async updateTask(_id: string, _patch: Partial<CreateTaskInput>): Promise<Task> { throw new Error("Not implemented"); }
  async completeTask(_id: string): Promise<Task> { throw new Error("Not implemented"); }
  async uncompleteTask(_id: string): Promise<Task> { throw new Error("Not implemented"); }
  async deleteTask(_id: string): Promise<void> { throw new Error("Not implemented"); }
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
pnpm vitest run src/db/sqlite-repository.test.ts
```

Expected: **PASS** — all 5 tests green.

---

## Task 6: SqliteRepository — tasks

**Files:**
- Modify: `src/db/sqlite-repository.test.ts` (add task tests)
- Modify: `src/db/sqlite-repository.ts` (implement task methods)

- [ ] **Step 6.1: Write failing tests for tasks**

Append to `src/db/sqlite-repository.test.ts`:

```typescript
describe("SqliteRepository — tasks", () => {
  const taskRow: TaskRow = {
    id: "task-1",
    title: "Préparer la démo",
    project_id: "proj-1",
    priority: "high",
    due_date: "2026-04-12",
    completed_at: null,
    sort_order: 0,
    created_at: "2026-04-10T10:00:00.000Z",
    updated_at: "2026-04-10T10:00:00.000Z",
  };

  it("createTask inserts a task and returns it with empty tags", async () => {
    const db = makeDb({
      select: vi.fn()
        .mockResolvedValueOnce([taskRow])   // getTask after insert
        .mockResolvedValueOnce([]),          // task_tags join
    });
    const repo = new SqliteRepository(db);
    const task = await repo.createTask({ title: "Préparer la démo", projectId: "proj-1", priority: "high" });
    expect(task.title).toBe("Préparer la démo");
    expect(task.tags).toEqual([]);
    expect(task.priority).toBe("high");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("createTask inserts task_tags rows when tagIds provided", async () => {
    const db = makeDb({
      select: vi.fn()
        .mockResolvedValueOnce([taskRow])
        .mockResolvedValueOnce([]),
    });
    const repo = new SqliteRepository(db);
    await repo.createTask({ title: "Task", tagIds: ["tag-1", "tag-2"] });
    // 1 INSERT for task + 2 INSERTs for tags
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("getTasks filters by projectId=null (Inbox)", async () => {
    const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
    const repo = new SqliteRepository(db);
    await repo.getTasks({ projectId: null });
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("project_id IS NULL");
  });

  it("getTasks filters by specific projectId", async () => {
    const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
    const repo = new SqliteRepository(db);
    await repo.getTasks({ projectId: "proj-1" });
    const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("project_id = ?");
    expect(params).toContain("proj-1");
  });

  it("getTasks with no filters excludes completed tasks", async () => {
    const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
    const repo = new SqliteRepository(db);
    await repo.getTasks();
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("completed_at IS NULL");
  });

  it("completeTask sets completed_at", async () => {
    const completedRow = { ...taskRow, completed_at: "2026-04-10T11:00:00.000Z" };
    const db = makeDb({
      select: vi.fn()
        .mockResolvedValueOnce([completedRow])
        .mockResolvedValueOnce([]),
    });
    const repo = new SqliteRepository(db);
    const task = await repo.completeTask("task-1");
    expect(task.completedAt).not.toBeNull();
    const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("completed_at");
  });

  it("deleteTask sets deleted_at (soft delete)", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.deleteTask("task-1");
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at");
    expect(params).toContain("task-1");
  });

  it("getTasks merges tag data from task_tags join", async () => {
    const db = makeDb({
      select: vi.fn()
        .mockResolvedValueOnce([taskRow])
        .mockResolvedValueOnce([
          { task_id: "task-1", tag_id: "tag-1", name: "urgent", color: "#f00" },
        ]),
    });
    const repo = new SqliteRepository(db);
    const tasks = await repo.getTasks();
    expect(tasks[0].tags).toHaveLength(1);
    expect(tasks[0].tags[0].name).toBe("urgent");
  });
});

// Add this type annotation at the top of the test file (after imports):
// declare const TaskRow: never; — not needed; the type is used only above
```

Note: also add the `TaskRow` import at the top of the test file:

```typescript
// Add to the top of sqlite-repository.test.ts
// (These are internal row types re-declared here to match what mocks return)
interface TaskRow {
  id: string; title: string; project_id: string | null; priority: string;
  due_date: string | null; completed_at: string | null; sort_order: number;
  created_at: string; updated_at: string;
}
```

- [ ] **Step 6.2: Run tests to verify new tests fail**

```bash
pnpm vitest run src/db/sqlite-repository.test.ts
```

Expected: **FAIL** — task methods throw "Not implemented".

- [ ] **Step 6.3: Implement task methods**

In `src/db/sqlite-repository.ts`, replace the stubbed task methods with:

```typescript
  // ---------- Tasks ----------

  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const conditions: string[] = ["t.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (filters?.projectId === null) {
      conditions.push("t.project_id IS NULL");
    } else if (filters?.projectId !== undefined) {
      conditions.push("t.project_id = ?");
      params.push(filters.projectId);
    }

    if (filters?.priority) {
      conditions.push("t.priority = ?");
      params.push(filters.priority);
    }

    if (filters?.completed === true) {
      conditions.push("t.completed_at IS NOT NULL");
    } else {
      // Default: hide completed tasks
      conditions.push("t.completed_at IS NULL");
    }

    if (filters?.dueBefore) {
      conditions.push("t.due_date <= ?");
      params.push(filters.dueBefore);
    }

    let sql = `SELECT t.id, t.title, t.project_id, t.priority, t.due_date, t.completed_at, t.sort_order, t.created_at, t.updated_at FROM tasks t WHERE ${conditions.join(" AND ")} ORDER BY t.sort_order, t.created_at`;

    if (filters?.tagIds && filters.tagIds.length > 0) {
      const placeholders = filters.tagIds.map(() => "?").join(", ");
      sql = `SELECT DISTINCT t.id, t.title, t.project_id, t.priority, t.due_date, t.completed_at, t.sort_order, t.created_at, t.updated_at FROM tasks t INNER JOIN task_tags tt ON tt.task_id = t.id WHERE ${conditions.join(" AND ")} AND tt.tag_id IN (${placeholders}) ORDER BY t.sort_order, t.created_at`;
      params.push(...filters.tagIds);
    }

    const taskRows = await this.db.select<TaskRow>(sql, params);
    if (taskRows.length === 0) return [];
    return this._attachTags(taskRows);
  }

  async getTask(id: string): Promise<Task | null> {
    const rows = await this.db.select<TaskRow>(
      "SELECT id, title, project_id, priority, due_date, completed_at, sort_order, created_at, updated_at FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    if (!rows[0]) return null;
    const withTags = await this._attachTags([rows[0]]);
    return withTags[0];
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO tasks (id, title, project_id, priority, due_date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
      [id, input.title, input.projectId ?? null, input.priority ?? "none", input.dueDate ?? null, now, now]
    );
    if (input.tagIds && input.tagIds.length > 0) {
      for (const tagId of input.tagIds) {
        await this.db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", [id, tagId]);
      }
    }
    return (await this.getTask(id))!;
  }

  async updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if ("title" in patch) { sets.push("title = ?"); params.push(patch.title); }
    if ("projectId" in patch) { sets.push("project_id = ?"); params.push(patch.projectId ?? null); }
    if ("priority" in patch) { sets.push("priority = ?"); params.push(patch.priority); }
    if ("dueDate" in patch) { sets.push("due_date = ?"); params.push(patch.dueDate ?? null); }
    params.push(id);
    await this.db.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, params);
    if ("tagIds" in patch && patch.tagIds !== undefined) {
      await this.db.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
      for (const tagId of patch.tagIds) {
        await this.db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", [id, tagId]);
      }
    }
    return (await this.getTask(id))!;
  }

  async completeTask(id: string): Promise<Task> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
    return (await this.getTask(id))!;
  }

  async uncompleteTask(id: string): Promise<Task> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tasks SET completed_at = NULL, updated_at = ? WHERE id = ?", [now, id]);
    return (await this.getTask(id))!;
  }

  async deleteTask(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  }

  private async _attachTags(taskRows: TaskRow[]): Promise<Task[]> {
    if (taskRows.length === 0) return [];
    const ids = taskRows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(", ");
    const tagRows = await this.db.select<TaskTagRow>(
      `SELECT tt.task_id, t.id as tag_id, t.name, t.color FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE t.deleted_at IS NULL AND tt.task_id IN (${placeholders})`,
      ids
    );
    const byTaskId = new Map<string, Tag[]>();
    for (const row of tagRows) {
      if (!byTaskId.has(row.task_id)) byTaskId.set(row.task_id, []);
      byTaskId.get(row.task_id)!.push({ id: row.tag_id, name: row.name, color: row.color });
    }
    return taskRows.map((row) => mapTask(row, byTaskId.get(row.id) ?? []));
  }
```

- [ ] **Step 6.4: Run all tests**

```bash
pnpm vitest run src/db/sqlite-repository.test.ts
```

Expected: **PASS** — all tests green.

---

## Task 7: Zustand stores

**Files:**
- Create: `src/store/tasks.ts`
- Create: `src/store/projects.ts`
- Create: `src/store/tags.ts`
- Create: `src/store/ui.ts`
- Create: `src/store/repository.ts` (module-level singleton)
- Create: `src/store/tasks.test.ts`

- [ ] **Step 7.1: Write failing store test**

Create `src/store/tasks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTaskStore } from "./tasks";
import type { TodoRepository } from "@/db/repository";
import type { Task } from "@/types";

const baseTask: Task = {
  id: "t1", title: "Test task", projectId: null, priority: "none",
  dueDate: null, completedAt: null, tags: [], sortOrder: 0,
  createdAt: "2026-04-10T10:00:00.000Z", updatedAt: "2026-04-10T10:00:00.000Z",
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
  return {
    getTasks: vi.fn().mockResolvedValue([baseTask]),
    getTask: vi.fn().mockResolvedValue(baseTask),
    createTask: vi.fn().mockResolvedValue(baseTask),
    updateTask: vi.fn().mockResolvedValue(baseTask),
    completeTask: vi.fn().mockResolvedValue({ ...baseTask, completedAt: "2026-04-10T11:00:00.000Z" }),
    uncompleteTask: vi.fn().mockResolvedValue(baseTask),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    getProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    getTags: vi.fn().mockResolvedValue([]),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    ...overrides,
  };
}

describe("useTaskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], loading: false });
  });

  it("loadTasks populates tasks from repository", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.loadTasks(repo); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("Test task");
  });

  it("createTask appends new task to state", async () => {
    const newTask: Task = { ...baseTask, id: "t2", title: "New task" };
    const repo = makeRepo({ createTask: vi.fn().mockResolvedValue(newTask) });
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.createTask(repo, { title: "New task" }); });
    expect(result.current.tasks.some((t) => t.id === "t2")).toBe(true);
  });

  it("deleteTask removes task from state", async () => {
    useTaskStore.setState({ tasks: [baseTask], loading: false });
    const repo = makeRepo({ deleteTask: vi.fn().mockResolvedValue(undefined) });
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.deleteTask(repo, "t1"); });
    expect(result.current.tasks).toHaveLength(0);
  });

  it("completeTask updates task in state", async () => {
    useTaskStore.setState({ tasks: [baseTask], loading: false });
    const completed = { ...baseTask, completedAt: "2026-04-10T11:00:00.000Z" };
    const repo = makeRepo({ completeTask: vi.fn().mockResolvedValue(completed) });
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.completeTask(repo, "t1"); });
    expect(result.current.tasks[0].completedAt).not.toBeNull();
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
pnpm vitest run src/store/tasks.test.ts
```

Expected: **FAIL** — stores don't exist yet.

- [ ] **Step 7.3: Implement stores**

Create `src/store/tasks.ts`:

```typescript
import { create } from "zustand";
import type { Task, CreateTaskInput, TaskFilters } from "@/types";
import type { TodoRepository } from "@/db/repository";

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  loadTasks(repo: TodoRepository, filters?: TaskFilters): Promise<void>;
  createTask(repo: TodoRepository, input: CreateTaskInput): Promise<Task>;
  updateTask(repo: TodoRepository, id: string, patch: Partial<CreateTaskInput>): Promise<void>;
  completeTask(repo: TodoRepository, id: string): Promise<void>;
  uncompleteTask(repo: TodoRepository, id: string): Promise<void>;
  deleteTask(repo: TodoRepository, id: string): Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,

  async loadTasks(repo, filters) {
    set({ loading: true });
    const tasks = await repo.getTasks(filters);
    set({ tasks, loading: false });
  },

  async createTask(repo, input) {
    const task = await repo.createTask(input);
    set((s) => ({ tasks: [task, ...s.tasks] }));
    return task;
  },

  async updateTask(repo, id, patch) {
    const updated = await repo.updateTask(id, patch);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  async completeTask(repo, id) {
    const updated = await repo.completeTask(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  async uncompleteTask(repo, id) {
    const updated = await repo.uncompleteTask(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  async deleteTask(repo, id) {
    await repo.deleteTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
}));
```

Create `src/store/projects.ts`:

```typescript
import { create } from "zustand";
import type { Project, CreateProjectInput } from "@/types";
import type { TodoRepository } from "@/db/repository";

interface ProjectStore {
  projects: Project[];
  loadProjects(repo: TodoRepository): Promise<void>;
  createProject(repo: TodoRepository, input: CreateProjectInput): Promise<Project>;
  updateProject(repo: TodoRepository, id: string, patch: Partial<CreateProjectInput>): Promise<void>;
  deleteProject(repo: TodoRepository, id: string): Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],

  async loadProjects(repo) {
    const projects = await repo.getProjects();
    set({ projects });
  },

  async createProject(repo, input) {
    const project = await repo.createProject(input);
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  async updateProject(repo, id, patch) {
    const updated = await repo.updateProject(id, patch);
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }));
  },

  async deleteProject(repo, id) {
    await repo.deleteProject(id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },
}));
```

Create `src/store/tags.ts`:

```typescript
import { create } from "zustand";
import type { Tag, CreateTagInput } from "@/types";
import type { TodoRepository } from "@/db/repository";

interface TagStore {
  tags: Tag[];
  loadTags(repo: TodoRepository): Promise<void>;
  createTag(repo: TodoRepository, input: CreateTagInput): Promise<Tag>;
  updateTag(repo: TodoRepository, id: string, patch: Partial<CreateTagInput>): Promise<void>;
  deleteTag(repo: TodoRepository, id: string): Promise<void>;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],

  async loadTags(repo) {
    const tags = await repo.getTags();
    set({ tags });
  },

  async createTag(repo, input) {
    const tag = await repo.createTag(input);
    set((s) => ({ tags: [...s.tags, tag] }));
    return tag;
  },

  async updateTag(repo, id, patch) {
    const updated = await repo.updateTag(id, patch);
    set((s) => ({ tags: s.tags.map((t) => (t.id === id ? updated : t)) }));
  },

  async deleteTag(repo, id) {
    await repo.deleteTag(id);
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
  },
}));
```

Create `src/store/ui.ts`:

```typescript
import { create } from "zustand";
import type { TaskFilters } from "@/types";

interface UIStore {
  sidebarCollapsed: boolean;
  selectedProjectId: string | null | undefined; // null = Inbox, undefined = all tasks
  selectedTaskId: string | null;
  activeFilters: TaskFilters;
  setSidebarCollapsed(v: boolean): void;
  setSelectedProject(id: string | null | undefined): void;
  setSelectedTask(id: string | null): void;
  setFilters(filters: Partial<TaskFilters>): void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  selectedProjectId: null,   // Start on Inbox
  selectedTaskId: null,
  activeFilters: {},

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setSelectedProject: (id) => set({ selectedProjectId: id, selectedTaskId: null, activeFilters: {} }),
  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setFilters: (filters) => set((s) => ({ activeFilters: { ...s.activeFilters, ...filters } })),
}));
```

- [ ] **Step 7.4: Run all tests**

```bash
pnpm vitest run
```

Expected: **PASS** — all tests green.

---

## Task 8: Theme system

**Files:**
- Create: `src/theme/types.ts`
- Create: `src/theme/themes/light.ts`
- Create: `src/theme/themes/dark.ts`
- Create: `src/theme/ThemeProvider.tsx`

No unit tests — the ThemeProvider applies CSS variables; tested visually.

- [ ] **Step 8.1: Write theme types**

Create `src/theme/types.ts`:

```typescript
export interface ThemeTokens {
  // shadcn/ui base tokens (values are CSS color strings)
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--border": string;
  "--input": string;
  "--ring": string;
  "--radius": string;
  // Usagi-specific
  "--priority-high": string;
  "--priority-medium": string;
  "--priority-low": string;
}

export interface Theme {
  name: string;
  tokens: ThemeTokens;
}

export type ThemeMode = "system" | "light" | "dark" | string;
```

- [ ] **Step 8.2: Write light theme**

Create `src/theme/themes/light.ts`:

```typescript
import type { Theme } from "../types";

export const lightTheme: Theme = {
  name: "light",
  tokens: {
    "--background": "oklch(1 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.205 0 0)",
    "--primary-foreground": "oklch(0.985 0 0)",
    "--secondary": "oklch(0.97 0 0)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--accent": "oklch(0.97 0 0)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
    "--ring": "oklch(0.708 0 0)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.577 0.245 27.325)",   // red
    "--priority-medium": "oklch(0.769 0.188 70.08)",   // amber
    "--priority-low": "oklch(0.627 0.194 149.214)",    // green
  },
};
```

- [ ] **Step 8.3: Write dark theme**

Create `src/theme/themes/dark.ts`:

```typescript
import type { Theme } from "../types";

export const darkTheme: Theme = {
  name: "dark",
  tokens: {
    "--background": "oklch(0.145 0 0)",
    "--foreground": "oklch(0.985 0 0)",
    "--card": "oklch(0.205 0 0)",
    "--card-foreground": "oklch(0.985 0 0)",
    "--popover": "oklch(0.205 0 0)",
    "--popover-foreground": "oklch(0.985 0 0)",
    "--primary": "oklch(0.922 0 0)",
    "--primary-foreground": "oklch(0.205 0 0)",
    "--secondary": "oklch(0.269 0 0)",
    "--secondary-foreground": "oklch(0.985 0 0)",
    "--muted": "oklch(0.269 0 0)",
    "--muted-foreground": "oklch(0.708 0 0)",
    "--accent": "oklch(0.269 0 0)",
    "--accent-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.556 0 0)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.637 0.237 25.331)",
    "--priority-medium": "oklch(0.828 0.189 84.429)",
    "--priority-low": "oklch(0.696 0.17 162.48)",
  },
};
```

- [ ] **Step 8.4: Write ThemeProvider**

Create `src/theme/ThemeProvider.tsx`:

```typescript
import { useEffect, createContext, useContext, useState, type ReactNode } from "react";
import type { Theme, ThemeMode } from "./types";
import { lightTheme } from "./themes/light";
import { darkTheme } from "./themes/dark";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
}

function resolveTheme(mode: ThemeMode, prefersDark: boolean): Theme {
  if (mode === "system") return prefersDark ? darkTheme : lightTheme;
  if (mode === "dark") return darkTheme;
  if (mode === "light") return lightTheme;
  // Custom theme: not yet implemented — fall back to system
  return prefersDark ? darkTheme : lightTheme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode = "system" }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem("theme-mode") as ThemeMode) ?? defaultMode;
  });

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      if (mode === "system") {
        const theme = resolveTheme("system", mediaQuery.matches);
        applyTheme(theme);
        document.documentElement.classList.toggle("dark", mediaQuery.matches);
      }
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode]);

  useEffect(() => {
    const isDark =
      mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    applyTheme(resolveTheme(mode, isDark));
  }, [mode]);

  function setMode(newMode: ThemeMode) {
    localStorage.setItem("theme-mode", newMode);
    setModeState(newMode);
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

---

## Task 9: App initialization

**Files:**
- Modify: `src/App.tsx`
- Create: `src/store/repository.ts`

- [ ] **Step 9.1: Create the repository singleton module**

Create `src/store/repository.ts`:

```typescript
// Module-level singleton — initialized once at app startup.
// All stores receive the repository via function arguments,
// making them testable without this module.

import type { TodoRepository } from "@/db/repository";

let _repository: TodoRepository | null = null;

export function setRepository(repo: TodoRepository) {
  _repository = repo;
}

export function getRepository(): TodoRepository {
  if (!_repository) throw new Error("Repository not initialized. Call setRepository() first.");
  return _repository;
}
```

- [ ] **Step 9.2: Write App.tsx**

Replace `src/App.tsx`:

```typescript
import { useEffect, useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { createRepository } from "@/db";
import { setRepository, getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppShell } from "@/components/layout/AppShell";

// Load migration SQL at build time (Vite raw import)
import migrationSql from "@/db/migrations/001_initial.sql?raw";

function AppContent() {
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadTags = useTagStore((s) => s.loadTags);

  useEffect(() => {
    const repo = getRepository();
    loadProjects(repo);
    loadTags(repo);
    loadTasks(repo, { projectId: null }); // Start on Inbox
  }, []);

  return <AppShell />;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const db = await Database.load("sqlite:usagi.db");
        // Run migration (idempotent CREATE TABLE IF NOT EXISTS)
        for (const statement of migrationSql.split(";").map((s) => s.trim()).filter(Boolean)) {
          await db.execute(statement);
        }
        setRepository(createRepository(db));
        setReady(true);
      } catch (err) {
        setError(String(err));
      }
    }
    init();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-destructive">
        Failed to initialize database: {error}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
```

- [ ] **Step 9.3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors (AppShell doesn't exist yet — add a temporary stub if needed):

Create a temporary `src/components/layout/AppShell.tsx`:
```typescript
export function AppShell() { return <div>Loading UI...</div>; }
```

---

## Task 10: AppShell & Sidebar

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/Sidebar.tsx`

Install required shadcn components first:

```bash
pnpm dlx shadcn@latest add button tooltip scroll-area separator
```

- [ ] **Step 10.1: Write AppShell**

Replace `src/components/layout/AppShell.tsx`:

```typescript
import { Sidebar } from "./Sidebar";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { useUIStore } from "@/store/ui";

export function AppShell() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <TaskList />
      {selectedTaskId && <TaskDetail />}
    </div>
  );
}
```

Create temporary stubs so the app compiles:

```typescript
// src/components/layout/TaskList.tsx (stub)
export function TaskList() { return <div className="flex-1 border-r border-border" />; }

// src/components/layout/TaskDetail.tsx (stub)
export function TaskDetail() { return <div className="w-80" />; }
```

- [ ] **Step 10.2: Write Sidebar**

Create `src/components/layout/Sidebar.tsx`:

```typescript
import { ChevronLeft, ChevronRight, Inbox, Calendar, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";
import { useProjectStore } from "@/store/projects";
import { todayIso } from "@/lib/utils";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, collapsed, onClick }: NavItemProps) {
  const inner = (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground font-medium"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return inner;
}

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, selectedProjectId, setSelectedProject } = useUIStore();
  const projects = useProjectStore((s) => s.projects);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-secondary border-r border-border shrink-0 transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Toggle button */}
      <div className="flex justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        {/* Smart lists */}
        <div className="space-y-1 pb-2">
          {!sidebarCollapsed && (
            <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Vues
            </p>
          )}
          <NavItem
            icon={<Inbox className="h-4 w-4" />}
            label="Inbox"
            active={selectedProjectId === null}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject(null)}
          />
          <NavItem
            icon={<Calendar className="h-4 w-4" />}
            label="Aujourd'hui"
            active={selectedProjectId === "today"}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject("today")}
          />
          <NavItem
            icon={<ListChecks className="h-4 w-4" />}
            label="Toutes les tâches"
            active={selectedProjectId === undefined}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject(undefined)}
          />
        </div>

        {projects.length > 0 && (
          <>
            <Separator className="my-2" />
            <div className="space-y-1 pb-2">
              {!sidebarCollapsed && (
                <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Projets
                </p>
              )}
              {projects.map((project) => (
                <NavItem
                  key={project.id}
                  icon={
                    <span
                      className="h-4 w-4 rounded-sm flex items-center justify-center text-xs"
                      style={{ background: project.color ?? "var(--muted)" }}
                    >
                      {project.icon ?? "📁"}
                    </span>
                  }
                  label={project.name}
                  active={selectedProjectId === project.id}
                  collapsed={sidebarCollapsed}
                  onClick={() => setSelectedProject(project.id)}
                />
              ))}
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  );
}
```

Install `lucide-react` if not already present:
```bash
pnpm add lucide-react
```

---

## Task 11: TaskList & TaskItem

**Files:**
- Modify: `src/components/layout/TaskList.tsx`
- Create: `src/components/tasks/TaskItem.tsx`
- Create: `src/components/tasks/FilterBar.tsx` (stub — completed in Task 12)

Install shadcn components:
```bash
pnpm dlx shadcn@latest add checkbox badge
```

- [ ] **Step 11.1: Write TaskItem**

Create `src/components/tasks/TaskItem.tsx`:

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import type { Task } from "@/types";

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const { completeTask, uncompleteTask } = useTaskStore();
  const { selectedTaskId, setSelectedTask } = useUIStore();
  const isSelected = selectedTaskId === task.id;

  async function handleChecked(checked: boolean) {
    const repo = getRepository();
    if (checked) await completeTask(repo, task.id);
    else await uncompleteTask(repo, task.id);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-border/50 transition-colors",
        "hover:bg-accent/40",
        isSelected && "bg-accent"
      )}
      onClick={() => setSelectedTask(task.id)}
    >
      <Checkbox
        checked={!!task.completedAt}
        onCheckedChange={handleChecked}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      <span
        className={cn(
          "flex-1 text-sm truncate",
          task.completedAt && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </span>
      {task.priority !== "none" && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] }}
          aria-label={`Priority: ${task.priority}`}
        />
      )}
      {task.dueDate && (
        <span
          className={cn(
            "text-xs shrink-0",
            isOverdue(task.dueDate) ? "text-[var(--priority-high)]" : "text-muted-foreground"
          )}
        >
          {formatDate(task.dueDate)}
        </span>
      )}
      {task.tags.slice(0, 2).map((tag) => (
        <Badge key={tag.id} variant="secondary" className="text-xs shrink-0 h-5">
          {tag.name}
        </Badge>
      ))}
      {task.tags.length > 2 && (
        <Badge variant="secondary" className="text-xs shrink-0 h-5">
          +{task.tags.length - 2}
        </Badge>
      )}
    </div>
  );
}
```

- [ ] **Step 11.2: Write TaskList**

Replace `src/components/layout/TaskList.tsx`:

```typescript
import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { todayIso } from "@/lib/utils";
import { TaskItem } from "@/components/tasks/TaskItem";
import { TaskForm } from "@/components/tasks/TaskForm";

function useListTitle(selectedProjectId: string | null | undefined, projectName?: string): string {
  if (selectedProjectId === null) return "Inbox";
  if (selectedProjectId === "today") return "Aujourd'hui";
  if (selectedProjectId === undefined) return "Toutes les tâches";
  return projectName ?? "Projet";
}

export function TaskList() {
  const { tasks, loadTasks } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const { selectedProjectId, activeFilters } = useUIStore();

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const title = useListTitle(selectedProjectId, currentProject?.name);

  useEffect(() => {
    const repo = getRepository();
    if (selectedProjectId === "today") {
      loadTasks(repo, { ...activeFilters, dueBefore: todayIso() });
    } else {
      loadTasks(repo, { ...activeFilters, projectId: selectedProjectId });
    }
  }, [selectedProjectId, activeFilters]);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-base">{title}</h2>
        <TaskForm projectId={selectedProjectId === "today" || selectedProjectId === undefined ? null : selectedProjectId}>
          <Button size="sm" variant="ghost" className="gap-1">
            <Plus className="h-4 w-4" />
            {!tasks.length ? "Nouvelle tâche" : ""}
          </Button>
        </TaskForm>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        {tasks.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">Aucune tâche</p>
        ) : (
          tasks.map((task) => <TaskItem key={task.id} task={task} />)
        )}
      </ScrollArea>
    </div>
  );
}
```

---

## Task 12: TaskForm dialog

**Files:**
- Create: `src/components/tasks/TaskForm.tsx`

Install shadcn components:
```bash
pnpm dlx shadcn@latest add dialog select
```

- [ ] **Step 12.1: Write TaskForm**

Create `src/components/tasks/TaskForm.tsx`:

```typescript
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTaskStore } from "@/store/tasks";
import { getRepository } from "@/store/repository";
import type { Priority } from "@/types";

interface TaskFormProps {
  children: ReactNode;
  projectId?: string | null;
}

export function TaskForm({ children, projectId = null }: TaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [dueDate, setDueDate] = useState("");
  const createTask = useTaskStore((s) => s.createTask);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask(getRepository(), {
      title: title.trim(),
      projectId: projectId ?? null,
      priority,
      dueDate: dueDate || null,
    });
    setTitle("");
    setPriority("none");
    setDueDate("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            placeholder="Titre de la tâche"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Task 13: TaskDetail

**Files:**
- Modify: `src/components/layout/TaskDetail.tsx`
- Create: `src/components/tasks/PrioritySelector.tsx`
- Create: `src/components/tasks/DueDatePicker.tsx`
- Create: `src/components/tasks/TagSelector.tsx`

Install shadcn components:
```bash
pnpm dlx shadcn@latest add popover calendar dropdown-menu
```

- [ ] **Step 13.1: Write PrioritySelector**

Create `src/components/tasks/PrioritySelector.tsx`:

```typescript
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import type { Priority } from "@/types";

const LABELS: Record<Priority, string> = {
  none: "Aucune",
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
};

const COLORS: Record<Priority, string> = {
  none: "var(--muted-foreground)",
  low: "var(--priority-low)",
  medium: "var(--priority-medium)",
  high: "var(--priority-high)",
};

interface PrioritySelectorProps {
  value: Priority;
  onChange: (p: Priority) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-7 px-2">
          <Flag className="h-3.5 w-3.5" style={{ color: COLORS[value] }} />
          <span className="text-xs">{LABELS[value]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["none", "low", "medium", "high"] as Priority[]).map((p) => (
          <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2">
            <Flag className="h-3.5 w-3.5" style={{ color: COLORS[p] }} />
            {LABELS[p]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 13.2: Write DueDatePicker**

Create `src/components/tasks/DueDatePicker.tsx`:

```typescript
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DueDatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
}

export function DueDatePicker({ value, onChange }: DueDatePickerProps) {
  const selected = value ? new Date(value) : undefined;

  function handleSelect(date: Date | undefined) {
    onChange(date ? date.toISOString().split("T")[0] : null);
  }

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 h-7 px-2">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="text-xs">
              {value ? formatDate(value) : "Date d'échéance"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onChange(null)}
          aria-label="Remove due date"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 13.3: Write TagSelector**

Create `src/components/tasks/TagSelector.tsx`:

```typescript
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTagStore } from "@/store/tags";
import type { Tag as TagType } from "@/types";

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const tags = useTagStore((s) => s.tags);

  function toggle(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-7 px-2 flex-wrap max-w-xs">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          {selectedTags.length === 0 ? (
            <span className="text-xs">Tags</span>
          ) : (
            selectedTags.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-xs h-4">
                {t.name}
              </Badge>
            ))
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52" align="start">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Aucun tag créé</p>
        ) : (
          <div className="space-y-1">
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggle(tag.id)}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                    selected && "bg-accent"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: tag.color ?? "var(--muted-foreground)" }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 13.4: Write TaskDetail**

Replace `src/components/layout/TaskDetail.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Trash2, CheckCircle, Circle } from "lucide-react";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { PrioritySelector } from "@/components/tasks/PrioritySelector";
import { DueDatePicker } from "@/components/tasks/DueDatePicker";
import { TagSelector } from "@/components/tasks/TagSelector";
import type { Task, Priority } from "@/types";

export function TaskDetail() {
  const { tasks, updateTask, completeTask, uncompleteTask, deleteTask } = useTaskStore();
  const { selectedTaskId, setSelectedTask } = useUIStore();

  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const [title, setTitle] = useState(task?.title ?? "");

  useEffect(() => {
    setTitle(task?.title ?? "");
  }, [task?.id]);

  if (!task) return null;

  const repo = getRepository();

  async function handleTitleBlur() {
    if (title.trim() && title !== task!.title) {
      await updateTask(repo, task!.id, { title: title.trim() });
    }
  }

  async function handlePriorityChange(priority: Priority) {
    await updateTask(repo, task!.id, { priority });
  }

  async function handleDateChange(dueDate: string | null) {
    await updateTask(repo, task!.id, { dueDate });
  }

  async function handleTagsChange(tagIds: string[]) {
    await updateTask(repo, task!.id, { tagIds });
  }

  async function handleToggleComplete() {
    if (task!.completedAt) await uncompleteTask(repo, task!.id);
    else await completeTask(repo, task!.id);
  }

  async function handleDelete() {
    await deleteTask(repo, task!.id);
    setSelectedTask(null);
  }

  return (
    <div className="w-80 shrink-0 flex flex-col h-full border-l border-border bg-card">
      {/* Complete / title */}
      <div className="flex items-start gap-3 p-4 border-b border-border">
        <button
          onClick={handleToggleComplete}
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={task.completedAt ? "Mark incomplete" : "Mark complete"}
        >
          {task.completedAt ? (
            <CheckCircle className="h-5 w-5 text-[var(--priority-low)]" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="border-none shadow-none p-0 text-base font-medium focus-visible:ring-0 bg-transparent"
          placeholder="Titre de la tâche"
        />
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-1 p-3 border-b border-border">
        <PrioritySelector value={task.priority} onChange={handlePriorityChange} />
        <DueDatePicker value={task.dueDate} onChange={handleDateChange} />
        <TagSelector
          selectedTagIds={task.tags.map((t) => t.id)}
          onChange={handleTagsChange}
        />
      </div>

      {/* Actions */}
      <div className="p-3 mt-auto">
        <Separator className="mb-3" />
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive w-full justify-start"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          Supprimer la tâche
        </Button>
      </div>
    </div>
  );
}
```

---

## Task 14: FilterBar & final wiring

**Files:**
- Create: `src/components/tasks/FilterBar.tsx`
- Modify: `src/components/layout/TaskList.tsx` (add FilterBar)

- [ ] **Step 14.1: Write FilterBar**

Create `src/components/tasks/FilterBar.tsx`:

```typescript
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useTagStore } from "@/store/tags";
import type { Priority } from "@/types";

const PRIORITY_LABELS: Record<Priority, string> = {
  none: "Aucune", low: "Basse", medium: "Moyenne", high: "Haute",
};

export function FilterBar() {
  const { activeFilters, setFilters } = useUIStore();
  const tags = useTagStore((s) => s.tags);

  const hasFilters = activeFilters.priority || (activeFilters.tagIds?.length ?? 0) > 0 || activeFilters.completed;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 flex-wrap">
      {/* Priority filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <SlidersHorizontal className="h-3 w-3" />
            {activeFilters.priority ? PRIORITY_LABELS[activeFilters.priority] : "Priorité"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(["high", "medium", "low", "none"] as Priority[]).map((p) => (
            <DropdownMenuItem key={p} onClick={() => setFilters({ priority: p })}>
              {PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Show completed toggle */}
      <Button
        variant={activeFilters.completed ? "secondary" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => setFilters({ completed: activeFilters.completed ? undefined : true })}
      >
        Complétées
      </Button>

      {/* Active filter chips */}
      {activeFilters.priority && (
        <Badge variant="secondary" className="gap-1 h-6 text-xs">
          {PRIORITY_LABELS[activeFilters.priority]}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => setFilters({ priority: undefined })}
          />
        </Badge>
      )}

      {/* Reset all */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground ml-auto"
          onClick={() => setFilters({ priority: undefined, tagIds: [], completed: undefined })}
        >
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 14.2: Add FilterBar to TaskList**

In `src/components/layout/TaskList.tsx`, add the import and insert `<FilterBar />` between the header and the ScrollArea:

```typescript
// Add import at top:
import { FilterBar } from "@/components/tasks/FilterBar";

// Add in JSX, after the header <div>:
<FilterBar />
```

- [ ] **Step 14.3: Run full test suite**

```bash
pnpm vitest run
```

Expected: **PASS** — all tests green.

- [ ] **Step 14.4: Run the app**

```bash
pnpm tauri dev
```

Expected: app opens, Inbox shows in the sidebar, clicking "+ Nouvelle tâche" opens the dialog, creating a task shows it in the list, clicking a task shows the detail panel on the right.

---

## Scope coverage checklist

| Spec section | Covered by |
|---|---|
| Stack (Tauri 2, React, TS, Tailwind v4, shadcn, Zustand, tauri-plugin-sql) | Task 1 |
| Types (Task, Project, Tag, inputs, filters) | Task 2 |
| DB schema (UUID PKs, soft deletes, timestamps, indexes) | Task 3 |
| DbDriver interface for testability | Task 4 |
| TodoRepository interface + factory | Task 4 |
| SqliteRepository (projects, tags) | Task 5 |
| SqliteRepository (tasks, tag joins, filters) | Task 6 |
| Zustand stores (tasks, projects, tags, ui) | Task 7 |
| Theme system (tokens, light/dark, ThemeProvider) | Task 8 |
| App initialization + DB migration on startup | Task 9 |
| 3-column layout + collapsible sidebar | Task 10 |
| Smart lists (Inbox, Aujourd'hui, Toutes) | Task 10–11 |
| Task list + task items (checkbox, priority, date, tags) | Task 11 |
| Task creation dialog (title, priority, due date) | Task 12 |
| Task detail panel (title edit, priority, date, tags, delete) | Task 13 |
| Filter bar (priority, completed toggle, reset) | Task 14 |
