# Project Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to group projects in the sidebar via drag & drop, with collapsible groups, color coding, and automatic cleanup of empty groups.

**Architecture:** Flat-list approach — a new `project_groups` SQLite table plus a nullable `group_id` FK on `projects`. The sidebar builds a sorted flat list of `SidebarItem` (group headers + standalone projects) and uses `@dnd-kit` (already in use for tasks) for all drag & drop interactions. A new Zustand store `useProjectGroupStore` handles group CRUD; auto-delete of empty groups lives in `useProjectStore.assignToGroup`.

**Tech Stack:** TypeScript, React, Zustand, `@dnd-kit/core` + `@dnd-kit/sortable`, `@base-ui/react` (Dialog), Tailwind CSS, SQLite via Tauri plugin.

**Forbidden** Write git commands (only read commands are authorized)

## Global Constraints

- SQLite migrations are numbered sequentially — next migration is `005_project_groups.sql`
- All DB row types use snake_case; TypeScript interfaces use camelCase — follow `mapProject` pattern
- Test file follows `sqlite-repository.test.ts` conventions: `makeDb()` factory, `vi.fn()` mocks, no real DB
- `@dnd-kit` version already installed: core `6.3.1`, sortable `10.0.0` — do not upgrade
- No nested groups — max one level deep
- Groups start expanded by default (not stored in DB)
- Color palette: reuse `PRESET_COLORS` from `@/lib/colors` — pick the first 8 entries

---

## File Map

| File                                            | Action | Responsibility                                                  |
| ----------------------------------------------- | ------ | --------------------------------------------------------------- |
| `src/db/migrations/005_project_groups.sql`      | Create | New table + FK column                                           |
| `src/types/index.ts`                            | Modify | Add `ProjectGroup`, `CreateProjectGroupInput`, update `Project` |
| `src/db/repository.ts`                          | Modify | Add group + reorder + assign methods to interface               |
| `src/db/sqlite-repository.ts`                   | Modify | Implement new repository methods                                |
| `src/db/sqlite-repository.test.ts`              | Modify | Tests for new repository methods                                |
| `src/lib/group-colors.ts`                       | Create | `GROUP_COLORS` palette + `pickGroupColor()` helper              |
| `src/store/projectGroups.ts`                    | Create | `useProjectGroupStore` Zustand store                            |
| `src/store/projects.ts`                         | Modify | Add `reorderProjects`, `assignToGroup`                          |
| `src/store/ui.ts`                               | Modify | Add `collapsedGroupIds: Set<string>` + `toggleGroupCollapsed`   |
| `src/components/projects/CreateGroupDialog.tsx` | Create | Modal for naming + coloring a new group on drop                 |
| `src/components/layout/ProjectGroupNavItem.tsx` | Create | Group header row in sidebar                                     |
| `src/components/layout/Sidebar.tsx`             | Modify | Wire DnD, build SidebarItem list, render groups                 |

---

## Task 1: DB Migration — `project_groups` table and `group_id` column

**Files:**

- Create: `src/db/migrations/005_project_groups.sql`

**Interfaces:**

- Produces: `project_groups` table with `(id, name, color, sort_order, created_at, updated_at)` and `group_id` nullable FK on `projects`

- [ ] **Step 1: Create the migration file**

```sql
-- src/db/migrations/005_project_groups.sql
CREATE TABLE IF NOT EXISTS project_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

ALTER TABLE projects ADD COLUMN group_id TEXT REFERENCES project_groups(id);

CREATE INDEX IF NOT EXISTS idx_projects_group_id ON projects(group_id);
```

- [ ] **Step 2: Verify the migration loads**

The Tauri app applies migrations on startup from the `migrations/` directory. Check `src/db/index.ts` or the Tauri setup to confirm the migration directory is scanned automatically (it should be — migrations 001–004 already follow this pattern).

Run the app: `npm run tauri dev`
Expected: app starts without errors, no SQLite schema error in console.

---

## Task 2: Types — `ProjectGroup` + update `Project`

**Files:**

- Modify: `src/types/index.ts`

**Interfaces:**

- Produces:
  - `ProjectGroup { id, name, color, sortOrder, createdAt, updatedAt }`
  - `CreateProjectGroupInput { name, color, projectIds }`
  - `Project` gains `groupId: string | null`

- [ ] **Step 1: Add `ProjectGroup` and `CreateProjectGroupInput`, update `Project`**

In `src/types/index.ts`, after the existing `Project` interface:

```typescript
export interface ProjectGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectGroupInput {
  name: string;
  color: string;
  projectIds: string[];
}
```

Update the `Project` interface — add one line after `sortOrder`:

```typescript
export interface Project {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  groupId: string | null; // ← add this
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npm run typecheck
```

Expected: errors only about unimplemented repository methods (not yet written) — that's fine. Zero errors about `ProjectGroup` itself.

---

## Task 3: Repository interface — add group + reorder + assign methods

**Files:**

- Modify: `src/db/repository.ts`

**Interfaces:**

- Consumes: `ProjectGroup`, `CreateProjectGroupInput` from `@/types`
- Produces:
  - `getProjectGroups(): Promise<ProjectGroup[]>`
  - `createProjectGroup(input: CreateProjectGroupInput): Promise<ProjectGroup>`
  - `updateProjectGroup(id: string, patch: Partial<Pick<ProjectGroup, 'name' | 'color'>>): Promise<ProjectGroup>`
  - `deleteProjectGroup(id: string): Promise<void>`
  - `reorderProjects(orderedIds: string[]): Promise<void>`
  - `assignProjectToGroup(projectId: string, groupId: string | null): Promise<void>`

- [ ] **Step 1: Add imports and new methods to the interface**

In `src/db/repository.ts`, add to the imports at the top:

```typescript
import type {
  CreateProjectGroupInput,
  CreateProjectInput,
  CreateTagInput,
  CreateTaskInput,
  Project,
  ProjectGroup,
  Tag,
  Task,
  TaskFilters,
} from "@/types";
```

Add new methods to the `TodoRepository` interface, after the existing `// Projects` block:

```typescript
  // Project Groups
  getProjectGroups(): Promise<ProjectGroup[]>;
  createProjectGroup(input: CreateProjectGroupInput): Promise<ProjectGroup>;
  updateProjectGroup(id: string, patch: Partial<Pick<ProjectGroup, "name" | "color">>): Promise<ProjectGroup>;
  deleteProjectGroup(id: string): Promise<void>;
  reorderProjects(orderedIds: string[]): Promise<void>;
  assignProjectToGroup(projectId: string, groupId: string | null): Promise<void>;
```

- [ ] **Step 2: Check TypeScript (expect SqliteRepository to have errors — not yet implemented)**

```bash
npm run typecheck 2>&1 | grep "repository\|SqliteRepository" | head -20
```

Expected: errors on `SqliteRepository` saying it doesn't implement the new methods. That confirms the interface is wired.

---

## Task 4: Repository implementation + tests

**Files:**

- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

**Interfaces:**

- Consumes: `ProjectGroup`, `CreateProjectGroupInput` from `@/types`; `ProjectRow` pattern already in file
- Produces: concrete implementations of all 6 methods from Task 3

- [ ] **Step 1: Write failing tests first**

Add to `src/db/sqlite-repository.test.ts`:

```typescript
describe("SqliteRepository — project groups", () => {
  it("createProjectGroup inserts a row and returns a ProjectGroup", async () => {
    const now = "2026-06-18T10:00:00.000Z";
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        {
          id: "grp-1",
          name: "Perso",
          color: "#6366f1",
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
      ]),
    });
    const repo = new SqliteRepository(db);
    const group = await repo.createProjectGroup({
      name: "Perso",
      color: "#6366f1",
      projectIds: [],
    });
    expect(group.name).toBe("Perso");
    expect(group.color).toBe("#6366f1");
    expect(typeof group.id).toBe("string");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("getProjectGroups returns mapped ProjectGroup[]", async () => {
    const now = "2026-06-18T10:00:00.000Z";
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        {
          id: "g1",
          name: "Work",
          color: "#3b82f6",
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: "g2",
          name: "Perso",
          color: "#22c55e",
          sort_order: 1,
          created_at: now,
          updated_at: now,
        },
      ]),
    });
    const repo = new SqliteRepository(db);
    const groups = await repo.getProjectGroups();
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("Work");
    expect(groups[1].sortOrder).toBe(1);
  });

  it("deleteProjectGroup executes a DELETE", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.deleteProjectGroup("grp-1");
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [
      "grp-1",
    ]);
  });

  it("reorderProjects updates sort_order for each id", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.reorderProjects(["p3", "p1", "p2"]);
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE projects"),
      expect.arrayContaining([0, "p3"]),
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE projects"),
      expect.arrayContaining([1, "p1"]),
    );
  });

  it("assignProjectToGroup sets group_id on a project", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.assignProjectToGroup("proj-1", "grp-1");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects"),
      expect.arrayContaining(["grp-1", "proj-1"]),
    );
  });

  it("assignProjectToGroup with null clears group_id", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.assignProjectToGroup("proj-1", null);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects"),
      expect.arrayContaining([null, "proj-1"]),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- sqlite-repository
```

Expected: all new tests FAIL with "not a function" or similar.

- [ ] **Step 3: Add `ProjectGroupRow` type and `mapProjectGroup` to `sqlite-repository.ts`**

After the existing `ProjectRow` interface (around line 16):

```typescript
interface ProjectGroupRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

After `mapProject` function:

```typescript
function mapProjectGroup(row: ProjectGroupRow): ProjectGroup {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

Also update `mapProject` to include `groupId`:

```typescript
function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    groupId:
      (row as ProjectRow & { group_id?: string | null }).group_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

And update the `ProjectRow` interface to include `group_id`:

```typescript
interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}
```

Update all `SELECT` queries for projects to include `group_id`:

```typescript
// In getProjects():
"SELECT id, name, color, icon, sort_order, group_id, created_at, updated_at FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, created_at";

// In _getProject():
"SELECT id, name, color, icon, sort_order, group_id, created_at, updated_at FROM projects WHERE id = ? AND deleted_at IS NULL";
```

- [ ] **Step 4: Implement the 6 new methods in `SqliteRepository`**

Add a new `// ---------- Project Groups ----------` section after the Projects section:

```typescript
// ---------- Project Groups ----------

async getProjectGroups(): Promise<ProjectGroup[]> {
  const rows = await this.db.select<ProjectGroupRow>(
    "SELECT id, name, color, sort_order, created_at, updated_at FROM project_groups ORDER BY sort_order, created_at",
  );
  return rows.map(mapProjectGroup);
}

async createProjectGroup(input: CreateProjectGroupInput): Promise<ProjectGroup> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await this.db.execute(
    "INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    [id, input.name, input.color, now, now],
  );
  const group = await this._getProjectGroup(id);
  if (!group) throw new Error(`ProjectGroup not found after write: ${id}`);
  return group;
}

async updateProjectGroup(
  id: string,
  patch: Partial<Pick<ProjectGroup, "name" | "color">>,
): Promise<ProjectGroup> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if ("name" in patch) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if ("color" in patch) {
    sets.push("color = ?");
    params.push(patch.color);
  }
  params.push(id);
  await this.db.execute(
    `UPDATE project_groups SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  const group = await this._getProjectGroup(id);
  if (!group) throw new Error(`ProjectGroup not found after write: ${id}`);
  return group;
}

async deleteProjectGroup(id: string): Promise<void> {
  await this.db.execute("DELETE FROM project_groups WHERE id = ?", [id]);
}

async reorderProjects(orderedIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    await this.db.execute(
      "UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?",
      [i, now, orderedIds[i]],
    );
  }
}

async assignProjectToGroup(
  projectId: string,
  groupId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await this.db.execute(
    "UPDATE projects SET group_id = ?, updated_at = ? WHERE id = ?",
    [groupId, now, projectId],
  );
}

private async _getProjectGroup(id: string): Promise<ProjectGroup | null> {
  const rows = await this.db.select<ProjectGroupRow>(
    "SELECT id, name, color, sort_order, created_at, updated_at FROM project_groups WHERE id = ?",
    [id],
  );
  return rows[0] ? mapProjectGroup(rows[0]) : null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test -- sqlite-repository
```

Expected: all tests pass (old + new).

- [ ] **Step 6: Check TypeScript**

```bash
npm run typecheck
```

Expected: no errors in `sqlite-repository.ts` or `repository.ts`.

---

## Task 5: Group colors utility

**Files:**

- Create: `src/lib/group-colors.ts`

**Interfaces:**

- Produces:
  - `GROUP_COLORS: string[]` — 8 hex values
  - `pickGroupColor(existingGroups: ProjectGroup[]): string` — returns least-used color

- [ ] **Step 1: Create the file**

```typescript
// src/lib/group-colors.ts
import { PRESET_COLORS } from "@/lib/colors";
import type { ProjectGroup } from "@/types";

export const GROUP_COLORS = PRESET_COLORS.slice(0, 8) as unknown as string[];

export function pickGroupColor(existingGroups: ProjectGroup[]): string {
  const usage = new Map<string, number>(GROUP_COLORS.map((c) => [c, 0]));
  for (const g of existingGroups) {
    if (usage.has(g.color)) {
      usage.set(g.color, (usage.get(g.color) ?? 0) + 1);
    }
  }
  let min = Infinity;
  let picked = GROUP_COLORS[0];
  for (const [color, count] of usage) {
    if (count < min) {
      min = count;
      picked = color;
    }
  }
  return picked;
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npm run typecheck 2>&1 | grep "group-colors"
```

Expected: no errors.

---

## Task 6: `useProjectGroupStore` Zustand store

**Files:**

- Create: `src/store/projectGroups.ts`

**Interfaces:**

- Consumes: `TodoRepository` from `@/db/repository`; `ProjectGroup`, `CreateProjectGroupInput` from `@/types`
- Produces:
  - `useProjectGroupStore` with `groups`, `loadGroups`, `createGroup`, `updateGroup`, `deleteGroup`

- [ ] **Step 1: Create the store**

```typescript
// src/store/projectGroups.ts
import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import type { CreateProjectGroupInput, ProjectGroup } from "@/types";

interface ProjectGroupStore {
  groups: ProjectGroup[];
  loadGroups(repo: TodoRepository): Promise<void>;
  createGroup(
    repo: TodoRepository,
    input: CreateProjectGroupInput,
  ): Promise<ProjectGroup>;
  updateGroup(
    repo: TodoRepository,
    id: string,
    patch: Partial<Pick<ProjectGroup, "name" | "color">>,
  ): Promise<void>;
  deleteGroup(repo: TodoRepository, id: string): Promise<void>;
}

export const useProjectGroupStore = create<ProjectGroupStore>((set) => ({
  groups: [],

  async loadGroups(repo) {
    const groups = await repo.getProjectGroups();
    set({ groups });
  },

  async createGroup(repo, input) {
    const group = await repo.createProjectGroup(input);
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  async updateGroup(repo, id, patch) {
    const updated = await repo.updateProjectGroup(id, patch);
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? updated : g)),
    }));
  },

  async deleteGroup(repo, id) {
    await repo.deleteProjectGroup(id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },
}));
```

- [ ] **Step 2: Check TypeScript**

```bash
npm run typecheck 2>&1 | grep "projectGroups"
```

Expected: no errors.

---

## Task 7: Extend `useProjectStore` + `useUIStore`

**Files:**

- Modify: `src/store/projects.ts`
- Modify: `src/store/ui.ts`

**Interfaces:**

- Consumes: `useProjectGroupStore` from `@/store/projectGroups`
- Produces (projects.ts):
  - `reorderProjects(repo, orderedIds): Promise<void>`
  - `assignToGroup(repo, projectId, groupId | null): Promise<void>` — auto-deletes empty group
- Produces (ui.ts):
  - `collapsedGroupIds: Set<string>`
  - `toggleGroupCollapsed(id: string): void`

- [ ] **Step 1: Extend `useProjectStore` in `src/store/projects.ts`**

Add the two new methods to the `ProjectStore` interface:

```typescript
interface ProjectStore {
  projects: Project[];
  loadProjects(repo: TodoRepository): Promise<void>;
  createProject(
    repo: TodoRepository,
    input: CreateProjectInput,
  ): Promise<Project>;
  updateProject(
    repo: TodoRepository,
    id: string,
    patch: Partial<CreateProjectInput>,
  ): Promise<void>;
  deleteProject(repo: TodoRepository, id: string): Promise<void>;
  reorderProjects(repo: TodoRepository, orderedIds: string[]): Promise<void>;
  assignToGroup(
    repo: TodoRepository,
    projectId: string,
    groupId: string | null,
  ): Promise<void>;
}
```

Add implementations inside `create<ProjectStore>((set, get) => ({`:

Note: change `(set) =>` to `(set, get) =>` to access current state.

```typescript
  async reorderProjects(repo, orderedIds) {
    await repo.reorderProjects(orderedIds);
    const reordered = orderedIds
      .map((id, index) => {
        const p = get().projects.find((p) => p.id === id);
        return p ? { ...p, sortOrder: index } : null;
      })
      .filter((p): p is Project => p !== null);
    const unchanged = get().projects.filter((p) => !orderedIds.includes(p.id));
    set({ projects: [...reordered, ...unchanged] });
  },

  async assignToGroup(repo, projectId, groupId) {
    const prevGroupId = get().projects.find((p) => p.id === projectId)?.groupId ?? null;
    await repo.assignProjectToGroup(projectId, groupId);
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, groupId } : p,
      ),
    }));
    if (prevGroupId && prevGroupId !== groupId) {
      const remaining = get().projects.filter((p) => p.groupId === prevGroupId);
      if (remaining.length === 0) {
        const { deleteGroup } = await import("@/store/projectGroups").then(
          (m) => m.useProjectGroupStore.getState(),
        );
        await deleteGroup(repo, prevGroupId);
      }
    }
  },
```

- [ ] **Step 2: Extend `useUIStore` in `src/store/ui.ts`**

Add to `UIStore` interface:

```typescript
  collapsedGroupIds: Set<string>;
  toggleGroupCollapsed(id: string): void;
```

Add to the initial state and implementation:

```typescript
  collapsedGroupIds: new Set<string>(),
  toggleGroupCollapsed: (id) =>
    set((s) => {
      const next = new Set(s.collapsedGroupIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { collapsedGroupIds: next };
    }),
```

- [ ] **Step 3: Check TypeScript**

```bash
npm run typecheck
```

Expected: no errors.

---

## Task 8: `CreateGroupDialog` component

**Files:**

- Create: `src/components/projects/CreateGroupDialog.tsx`

**Interfaces:**

- Consumes:
  - `Project` from `@/types`
  - `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`
  - `Button` from `@/components/ui/button`
  - `Input` from `@/components/ui/input`
  - `GROUP_COLORS`, `pickGroupColor` from `@/lib/group-colors`
  - `useProjectGroupStore` from `@/store/projectGroups`
  - `useProjectStore` from `@/store/projects`
  - `getRepository` from `@/store/repository`
- Produces: `CreateGroupDialog` component

```typescript
interface CreateGroupDialogProps {
  open: boolean;
  projectA: Project;
  projectB: Project;
  onConfirm(groupId: string): void;
  onCancel(): void;
}
```

- [ ] **Step 1: Create the component**

```typescript
// src/components/projects/CreateGroupDialog.tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GROUP_COLORS, pickGroupColor } from "@/lib/group-colors";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import type { Project } from "@/types";

interface CreateGroupDialogProps {
  open: boolean;
  projectA: Project;
  projectB: Project;
  onConfirm(groupId: string): void;
  onCancel(): void;
}

export function CreateGroupDialog({
  open,
  projectA,
  projectB,
  onConfirm,
  onCancel,
}: CreateGroupDialogProps) {
  const { t } = useTranslation();
  const groups = useProjectGroupStore((s) => s.groups);
  const { createGroup } = useProjectGroupStore();
  const { assignToGroup } = useProjectStore();
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => pickGroupColor(groups));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setColor(pickGroupColor(groups));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, groups]);

  async function handleConfirm() {
    if (!name.trim()) return;
    const repo = getRepository();
    const group = await createGroup(repo, {
      name: name.trim(),
      color,
      projectIds: [projectA.id, projectB.id],
    });
    await assignToGroup(repo, projectA.id, group.id);
    await assignToGroup(repo, projectB.id, group.id);
    onConfirm(group.id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("projectGroup.createTitle", "Nouveau groupe")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projectGroup.namePlaceholder", "Nom du groupe")}
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
          />

          <div className="flex gap-2 flex-wrap">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : undefined,
                  outlineOffset: color === c ? "2px" : undefined,
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel", "Annuler")}
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            {t("projectGroup.create", "Créer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npm run typecheck 2>&1 | grep "CreateGroupDialog"
```

Expected: no errors.

---

## Task 9: `ProjectGroupNavItem` component

**Files:**

- Create: `src/components/layout/ProjectGroupNavItem.tsx`

**Interfaces:**

- Consumes:
  - `ProjectGroup`, `Project` from `@/types`
  - `useProjectGroupStore` from `@/store/projectGroups`
  - `useProjectStore` from `@/store/projects`
  - `useUIStore` from `@/store/ui`
  - `getRepository` from `@/store/repository`
  - `ContextMenu*` from `@/components/ui/context-menu`
  - `ChevronDown`, `ChevronRight` from `lucide-react`
  - `cn` from `@/lib/utils`
- Produces: `ProjectGroupNavItem` component

```typescript
interface ProjectGroupNavItemProps {
  group: ProjectGroup;
  projects: Project[];
  collapsed: boolean; // sidebar collapsed (not group collapsed)
}
```

- [ ] **Step 1: Create the component**

```typescript
// src/components/layout/ProjectGroupNavItem.tsx
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useUIStore } from "@/store/ui";
import type { Project, ProjectGroup } from "@/types";

interface ProjectGroupNavItemProps {
  group: ProjectGroup;
  projects: Project[];
  collapsed: boolean;
}

export function ProjectGroupNavItem({
  group,
  projects,
  collapsed,
}: ProjectGroupNavItemProps) {
  const { t } = useTranslation();
  const { collapsedGroupIds, toggleGroupCollapsed } = useUIStore();
  const { updateGroup, deleteGroup } = useProjectGroupStore();
  const { assignToGroup } = useProjectStore();
  const isCollapsed = collapsedGroupIds.has(group.id);

  async function handleDissolve() {
    const repo = getRepository();
    for (const p of projects) {
      await assignToGroup(repo, p.id, null);
    }
    await deleteGroup(repo, group.id);
  }

  async function handleRename() {
    const name = window.prompt(t("projectGroup.renamePlaceholder", "Nouveau nom"), group.name);
    if (name && name.trim() && name.trim() !== group.name) {
      await updateGroup(getRepository(), group.id, { name: name.trim() });
    }
  }

  if (collapsed) {
    return (
      <div
        className="mx-2 h-0.5 rounded-full"
        style={{ backgroundColor: group.color }}
        title={group.name}
      />
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => toggleGroupCollapsed(group.id)}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider",
            "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors",
          )}
        >
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: group.color }}
          />
          <span className="flex-1 truncate text-left">{group.name}</span>
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleRename}>
          {t("projectGroup.rename", "Renommer")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleDissolve} className="text-destructive">
          {t("projectGroup.dissolve", "Dissoudre le groupe")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npm run typecheck 2>&1 | grep "ProjectGroupNavItem"
```

Expected: no errors.

---

## Task 10: Wire everything in `Sidebar.tsx` — DnD + groups rendering

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**

- Consumes:
  - `useProjectGroupStore` from `@/store/projectGroups`
  - `useUIStore.collapsedGroupIds`
  - `ProjectGroupNavItem` from `@/components/layout/ProjectGroupNavItem`
  - `CreateGroupDialog` from `@/components/projects/CreateGroupDialog`
  - `DndContext`, `DragEndEvent`, `DragOverEvent`, `DragStartEvent`, `PointerSensor`, `useSensor`, `useSensors`, `closestCenter`, `DragOverlay` from `@dnd-kit/core`
  - `SortableContext`, `useSortable`, `verticalListSortingStrategy`, `arrayMove` from `@dnd-kit/sortable`
  - `useProjectStore.reorderProjects`, `useProjectStore.assignToGroup`

This is the most complex task. Read through the full implementation below before starting.

**Key concept — `SidebarItem` flat list:**

```typescript
type SidebarItem =
  | { type: "group"; group: ProjectGroup; projects: Project[] }
  | { type: "project"; project: Project; groupId: string | null };
```

The list is built by sorting projects + groups by `sortOrder`. Each item gets a unique `dndId` for dnd-kit: `"group:<id>"` or `"project:<id>"`.

**Key concept — drag over zones:**

During drag, track the `overId`. On `dragEnd`:

- `overId` is `"group:<gid>"` → add dragged project to that group
- `overId` is `"project:<pid>"` where that project is standalone and the dragged project is also standalone → open `CreateGroupDialog`
- `overId` is `"project:<pid>"` where that project is in a group → add dragged project to that group
- `overId` is a gap position → reorder

- [ ] **Step 1: Load groups in `AppShell` (or wherever `loadProjects` is called)**

Find where `loadProjects` is called on app init. Add `loadGroups` next to it. Search:

```bash
grep -rn "loadProjects" /home/loan/Projects/perso/usagi/src --include="*.tsx" --include="*.ts"
```

In that file, import `useProjectGroupStore` and call:

```typescript
await useProjectGroupStore.getState().loadGroups(repo);
```

alongside the existing `loadProjects` call.

- [ ] **Step 2: Add imports to `Sidebar.tsx`**

Add to the import block:

```typescript
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { CreateGroupDialog } from "@/components/projects/CreateGroupDialog";
import { ProjectGroupNavItem } from "@/components/layout/ProjectGroupNavItem";
import { useProjectGroupStore } from "@/store/projectGroups";
import type { ProjectGroup } from "@/types";
```

- [ ] **Step 3: Make `ProjectNavItem` sortable**

Wrap the existing `ProjectNavItem` internals with `useSortable`. Add at the top of `ProjectNavItem`:

```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: `project:${project.id}` });

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.4 : 1,
};
```

Wrap the outermost element of `ProjectNavItem` with `ref={setNodeRef} style={style} {...attributes} {...listeners}`.

The outermost element in `ProjectNavItem` is the `<ContextMenu>` wrapper — apply the ref and style to the inner `<ContextMenuTrigger>` div instead (since `ContextMenu` doesn't forward refs directly).

- [ ] **Step 4: Build the `buildSidebarItems` helper inside `Sidebar`**

Add inside the `Sidebar` function, after reading stores:

```typescript
const groups = useProjectGroupStore((s) => s.groups);
const { reorderProjects, assignToGroup } = useProjectStore();
const { collapsedGroupIds } = useUIStore();

type SidebarItem =
  | { type: "group"; group: ProjectGroup; projects: Project[]; dndId: string }
  | { type: "project"; project: Project; dndId: string };

const sidebarItems = useMemo((): SidebarItem[] => {
  const items: SidebarItem[] = [];
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const projectsByGroup = new Map<string, Project[]>();
  const standaloneProjects: Project[] = [];

  for (const p of projects) {
    if (p.groupId) {
      const list = projectsByGroup.get(p.groupId) ?? [];
      list.push(p);
      projectsByGroup.set(p.groupId, list);
    } else {
      standaloneProjects.push(p);
    }
  }

  // Merge groups and standalone projects into one sorted list
  const allTopLevel: Array<{ sortOrder: number; item: SidebarItem }> = [];

  for (const [gid, gProjects] of projectsByGroup) {
    const group = groupMap.get(gid);
    if (!group) continue;
    const sorted = [...gProjects].sort((a, b) => a.sortOrder - b.sortOrder);
    allTopLevel.push({
      sortOrder: group.sortOrder,
      item: { type: "group", group, projects: sorted, dndId: `group:${gid}` },
    });
  }

  for (const p of standaloneProjects) {
    allTopLevel.push({
      sortOrder: p.sortOrder,
      item: { type: "project", project: p, dndId: `project:${p.id}` },
    });
  }

  allTopLevel.sort((a, b) => a.sortOrder - b.sortOrder);

  for (const { item } of allTopLevel) {
    items.push(item);
    if (item.type === "group" && !collapsedGroupIds.has(item.group.id)) {
      for (const p of item.projects) {
        items.push({ type: "project", project: p, dndId: `project:${p.id}` });
      }
    }
  }

  return items;
}, [projects, groups, collapsedGroupIds]);
```

- [ ] **Step 5: Add DnD state and handlers in `Sidebar`**

```typescript
const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
const [pendingGroupProjects, setPendingGroupProjects] = useState<{
  projectA: Project;
  projectB: Project;
} | null>(null);

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }),
);

function handleDragStart({ active }: DragStartEvent) {
  const id = String(active.id);
  if (id.startsWith("project:")) setActiveProjectId(id.slice(8));
}

function handleDragEnd({ active, over }: DragEndEvent) {
  setActiveProjectId(null);
  if (!over || active.id === over.id) return;

  const activeId = String(active.id);
  const overId = String(over.id);
  if (!activeId.startsWith("project:")) return;

  const draggedProjectId = activeId.slice(8);
  const draggedProject = projects.find((p) => p.id === draggedProjectId);
  if (!draggedProject) return;

  const repo = getRepository();

  if (overId.startsWith("group:")) {
    // Drop on group header → add to group
    const groupId = overId.slice(6);
    assignToGroup(repo, draggedProjectId, groupId);
    return;
  }

  if (overId.startsWith("project:")) {
    const targetProjectId = overId.slice(8);
    const targetProject = projects.find((p) => p.id === targetProjectId);
    if (!targetProject) return;

    if (
      targetProject.groupId &&
      draggedProject.groupId !== targetProject.groupId
    ) {
      // Drop on project inside a different group → add to that group
      assignToGroup(repo, draggedProjectId, targetProject.groupId);
      return;
    }

    if (!targetProject.groupId && !draggedProject.groupId) {
      // Drop standalone → standalone → create group
      setPendingGroupProjects({
        projectA: draggedProject,
        projectB: targetProject,
      });
      return;
    }

    if (!targetProject.groupId && draggedProject.groupId) {
      // Drop from group onto standalone → open create group dialog
      setPendingGroupProjects({
        projectA: draggedProject,
        projectB: targetProject,
      });
      return;
    }

    // Same group reorder — use arrayMove on all project IDs
    const allIds = projects.map((p) => p.id);
    const oldIndex = allIds.indexOf(draggedProjectId);
    const newIndex = allIds.indexOf(targetProjectId);
    const newOrder = arrayMove(allIds, oldIndex, newIndex);
    reorderProjects(repo, newOrder);
    return;
  }
}

function handleDragOver({ active, over }: DragOverEvent) {
  // Used to highlight drop targets — track via activeProjectId already set
  // No state changes needed here; visual feedback is handled by useSortable
}
```

- [ ] **Step 6: Replace the static project list in the JSX with the DnD list**

Replace the `{projects.map((project) => (...))}` block (around line 671) with:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
  onDragOver={handleDragOver}
>
  <SortableContext
    items={sidebarItems.map((i) => i.dndId)}
    strategy={verticalListSortingStrategy}
  >
    {sidebarItems.map((item) => {
      if (item.type === "group") {
        return (
          <ProjectGroupNavItem
            key={item.group.id}
            group={item.group}
            projects={item.projects}
            collapsed={sidebarCollapsed}
          />
        );
      }
      return (
        <ProjectNavItem
          key={item.project.id}
          project={item.project}
          active={selectedProjectId === item.project.id}
          collapsed={sidebarCollapsed}
          onClick={() => setSelectedProject(item.project.id)}
        />
      );
    })}
  </SortableContext>
  <DragOverlay>
    {activeProjectId ? (
      <div className="opacity-90 rounded-md bg-sidebar-accent px-3 py-2 text-sm shadow-lg">
        {projects.find((p) => p.id === activeProjectId)?.name}
      </div>
    ) : null}
  </DragOverlay>
</DndContext>;

{
  pendingGroupProjects && (
    <CreateGroupDialog
      open={true}
      projectA={pendingGroupProjects.projectA}
      projectB={pendingGroupProjects.projectB}
      onConfirm={() => setPendingGroupProjects(null)}
      onCancel={() => setPendingGroupProjects(null)}
    />
  );
}
```

- [ ] **Step 7: Check TypeScript**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 8: Run the app and test manually**

```bash
npm run tauri dev
```

Test the following scenarios:

1. Drag one project onto another → `CreateGroupDialog` opens
2. Enter a name, pick a color, click "Créer" → group appears in sidebar with both projects
3. Click group header → collapses/expands
4. Drag a third project onto the group header → project moves into group
5. Drag a project out of a group to a standalone position → project leaves group; if last member, group disappears
6. Right-click group → "Dissoudre le groupe" → all projects become standalone
7. Reorder standalone projects by dragging

---

## Self-Review Checklist

- [x] **Migration**: `005_project_groups.sql` creates table + FK column + index
- [x] **Types**: `ProjectGroup`, `CreateProjectGroupInput`, `Project.groupId` all defined
- [x] **Repository interface**: all 6 new methods declared
- [x] **Repository impl + tests**: `createProjectGroup`, `getProjectGroups`, `deleteProjectGroup`, `reorderProjects`, `assignProjectToGroup` all tested and implemented
- [x] **Group colors**: `GROUP_COLORS` (8 colors), `pickGroupColor` least-used selection
- [x] **Store (groups)**: `loadGroups`, `createGroup`, `updateGroup`, `deleteGroup`
- [x] **Store (projects)**: `reorderProjects`, `assignToGroup` with auto-delete empty group
- [x] **Store (UI)**: `collapsedGroupIds`, `toggleGroupCollapsed`
- [x] **CreateGroupDialog**: name input, color picker, auto-color pre-selected, disabled "Créer" when empty
- [x] **ProjectGroupNavItem**: color pip, name, collapse chevron, context menu (rename, dissolve)
- [x] **Sidebar DnD**: all 7 drop scenarios from spec covered
- [x] **loadGroups** called at app init alongside `loadProjects`
