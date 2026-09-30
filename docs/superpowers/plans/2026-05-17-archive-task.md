# Archive Task (Soft Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Archive" action (soft delete, recoverable) alongside a true hard delete, with a dedicated "Archives" sidebar view for browsing, restoring, and permanently deleting archived tasks.

**Architecture:** The SQLite layer already has `deleted_at` and `deleteTask` already does a soft delete — we rename it to `archiveTask`, introduce a real hard `DELETE` as the new `deleteTask`, add `unarchiveTask`/`getArchivedTasks`, wire them through the Zustand store, and surface them in the UI. The ArchiveView follows the same sentinel-value pattern as CalendarView and TagManager.

**Tech Stack:** TypeScript, React, Zustand, SQLite (Tauri plugin-sql), lucide-react, react-i18next, vitest, @testing-library/react

---

## File Map

| Action | Path                                    |
| ------ | --------------------------------------- |
| Modify | `src/types/index.ts`                    |
| Modify | `src/i18n/locales/en.ts`                |
| Modify | `src/i18n/locales/fr.ts`                |
| Modify | `src/db/repository.ts`                  |
| Modify | `src/db/sqlite-repository.ts`           |
| Modify | `src/store/tasks.ts`                    |
| Modify | `src/store/tasks.test.ts`               |
| Modify | `src/components/tasks/TaskItem.tsx`     |
| Modify | `src/components/layout/TaskDetail.tsx`  |
| Create | `src/components/layout/ArchiveView.tsx` |
| Modify | `src/components/layout/Sidebar.tsx`     |
| Modify | `src/components/layout/AppShell.tsx`    |

---

### Task 1: Types + i18n keys

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Add `deletedAt` to the `Task` interface**

In `src/types/index.ts`, update the `Task` interface:

```typescript
export interface Task {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  priority: Priority;
  dueDate: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  tags: Tag[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add i18n keys to `en.ts`**

In `src/i18n/locales/en.ts`, add to the `task` section:

```typescript
task: {
    new: "New task",
    titlePlaceholder: "Task title",
    descriptionPlaceholder: "Add a note…",
    noTasks: "No tasks",
    delete: "Delete task",
    archive: "Archive task",
    restore: "Restore",
    close: "Close detail",
    markComplete: "Mark complete",
    markIncomplete: "Mark incomplete",
    reorder: "Reorder task",
    projectFallback: "Project",
    addDate: "Add date",
    search: "Search…",
},
```

Add to the `nav` section:

```typescript
nav: {
    views: "Views",
    inbox: "Inbox",
    today: "Today",
    allTasks: "All tasks",
    tags: "Tags",
    calendar: "Calendar",
    archives: "Archives",
    projects: "Projects",
    newProject: "New project",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
},
```

Add a new top-level `archive` section (after `taskList`):

```typescript
archive: {
    empty: "No archived tasks",
    archivedOn: "Archived on {{date}}",
},
```

- [ ] **Step 3: Add i18n keys to `fr.ts`**

In `src/i18n/locales/fr.ts`, mirror the same structure (fr.ts is typed as `typeof en`):

```typescript
task: {
    new: "Nouvelle tâche",
    titlePlaceholder: "Titre de la tâche",
    descriptionPlaceholder: "Ajouter une note…",
    noTasks: "Aucune tâche",
    delete: "Supprimer la tâche",
    archive: "Archiver la tâche",
    restore: "Restaurer",
    close: "Fermer le détail",
    markComplete: "Marquer comme terminée",
    markIncomplete: "Marquer comme non terminée",
    reorder: "Réordonner la tâche",
    projectFallback: "Projet",
    addDate: "Ajouter une date",
    search: "Rechercher…",
},
```

```typescript
nav: {
    views: "Vues",
    inbox: "Inbox",
    today: "Aujourd'hui",
    allTasks: "Toutes les tâches",
    tags: "Tags",
    calendar: "Calendrier",
    archives: "Archives",
    projects: "Projets",
    newProject: "Nouveau projet",
    expandSidebar: "Développer la sidebar",
    collapseSidebar: "Réduire la sidebar",
},
```

```typescript
archive: {
    empty: "Aucune tâche archivée",
    archivedOn: "Archivée le {{date}}",
},
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm build 2>&1 | head -30`

Expected: no errors related to missing keys or Task type.

---

### Task 2: Repository interface

**Files:**

- Modify: `src/db/repository.ts`

- [ ] **Step 1: Update the `TodoRepository` interface**

Replace the single `deleteTask` with four methods:

```typescript
export interface TodoRepository {
  // Tasks
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task>;
  completeTask(id: string): Promise<Task>;
  uncompleteTask(id: string): Promise<Task>;
  archiveTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  unarchiveTask(id: string): Promise<void>;
  getArchivedTasks(): Promise<Task[]>;
  reorderTasks(orderedIds: string[]): Promise<void>;

  // Projects
  getProjects(): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(
    id: string,
    patch: Partial<CreateProjectInput>,
  ): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Tags
  getTags(projectId?: string | null): Promise<Tag[]>;
  createTag(input: CreateTagInput): Promise<Tag>;
  updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  isTagUsedInProjectTasks(tagId: string): Promise<boolean>;

  // Settings
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
}
```

---

### Task 3: SQLite repository implementation

**Files:**

- Modify: `src/db/sqlite-repository.ts`

- [ ] **Step 1: Add `deleted_at` to `TaskRow` and update `mapTask`**

In the `TaskRow` interface, add the optional field:

```typescript
interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
```

Update `mapTask` to map the new field:

```typescript
function mapTask(row: TaskRow, tags: Tag[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    priority: row.priority as Task["priority"],
    dueDate: row.due_date,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at ?? null,
    tags,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 2: Rename `deleteTask` → `archiveTask`, add hard `deleteTask`**

Replace the current `deleteTask` method (lines ~402–408) with two methods:

```typescript
async archiveTask(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
        "UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?",
        [now, now, id],
    );
}

async deleteTask(id: string): Promise<void> {
    await this.db.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
    await this.db.execute("DELETE FROM tasks WHERE id = ?", [id]);
}
```

- [ ] **Step 3: Add `unarchiveTask`**

After `deleteTask`, add:

```typescript
async unarchiveTask(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
        "UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?",
        [now, id],
    );
}
```

- [ ] **Step 4: Add `getArchivedTasks`**

After `unarchiveTask`, add:

```typescript
async getArchivedTasks(): Promise<Task[]> {
    const taskRows = await this.db.select<TaskRow>(
        "SELECT id, title, description, project_id, priority, due_date, completed_at, sort_order, created_at, updated_at, deleted_at FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    );
    if (taskRows.length === 0) return [];
    return this._attachTags(taskRows);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm build 2>&1 | head -30`

Expected: no errors. `SqliteRepository` satisfies `TodoRepository`.

---

### Task 4: Tasks store (TDD)

**Files:**

- Modify: `src/store/tasks.test.ts`
- Modify: `src/store/tasks.ts`

- [ ] **Step 1: Update `baseTask` fixture**

In `src/store/tasks.test.ts`, add `deletedAt: null` to `baseTask`:

```typescript
const baseTask: Task = {
  id: "t1",
  title: "Test task",
  description: null,
  projectId: null,
  priority: "none",
  dueDate: null,
  completedAt: null,
  deletedAt: null,
  tags: [],
  sortOrder: 0,
  createdAt: "2026-04-10T10:00:00.000Z",
  updatedAt: "2026-04-10T10:00:00.000Z",
};
```

- [ ] **Step 2: Update `makeRepo` with new methods**

Add `archiveTask`, `unarchiveTask`, `getArchivedTasks` to `makeRepo`, and keep `deleteTask` as a hard-delete mock:

```typescript
function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
  return {
    getTasks: vi.fn().mockResolvedValue([baseTask]),
    getTask: vi.fn().mockResolvedValue(baseTask),
    createTask: vi.fn().mockResolvedValue(baseTask),
    updateTask: vi.fn().mockResolvedValue(baseTask),
    completeTask: vi.fn().mockResolvedValue({
      ...baseTask,
      completedAt: "2026-04-10T11:00:00.000Z",
    }),
    uncompleteTask: vi.fn().mockResolvedValue(baseTask),
    archiveTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    unarchiveTask: vi.fn().mockResolvedValue(undefined),
    getArchivedTasks: vi.fn().mockResolvedValue([]),
    getProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    getTags: vi.fn().mockResolvedValue([]),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    reorderTasks: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({}),
    setSetting: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
```

- [ ] **Step 3: Update `beforeEach` to reset `archivedTasks`**

```typescript
beforeEach(() => {
  useTaskStore.setState({ tasks: [], archivedTasks: [], loading: false });
});
```

- [ ] **Step 4: Update the existing `deleteTask` test**

Rename the test to reflect it is now a hard delete:

```typescript
it("deleteTask hard-deletes task from tasks state", async () => {
  useTaskStore.setState({
    tasks: [baseTask],
    archivedTasks: [],
    loading: false,
  });
  const repo = makeRepo({ deleteTask: vi.fn().mockResolvedValue(undefined) });
  const { result } = renderHook(() => useTaskStore());
  await act(async () => {
    await result.current.deleteTask(repo, "t1");
  });
  expect(result.current.tasks).toHaveLength(0);
});
```

- [ ] **Step 5: Write new failing tests**

Add these three tests:

```typescript
it("archiveTask removes task from tasks array", async () => {
  useTaskStore.setState({
    tasks: [baseTask],
    archivedTasks: [],
    loading: false,
  });
  const repo = makeRepo({ archiveTask: vi.fn().mockResolvedValue(undefined) });
  const { result } = renderHook(() => useTaskStore());
  await act(async () => {
    await result.current.archiveTask(repo, "t1");
  });
  expect(result.current.tasks).toHaveLength(0);
});

it("loadArchivedTasks populates archivedTasks from repository", async () => {
  const archivedTask: Task = {
    ...baseTask,
    id: "t2",
    deletedAt: "2026-05-01T10:00:00.000Z",
  };
  const repo = makeRepo({
    getArchivedTasks: vi.fn().mockResolvedValue([archivedTask]),
  });
  const { result } = renderHook(() => useTaskStore());
  await act(async () => {
    await result.current.loadArchivedTasks(repo);
  });
  expect(result.current.archivedTasks).toHaveLength(1);
  expect(result.current.archivedTasks[0].id).toBe("t2");
});

it("unarchiveTask removes task from archivedTasks", async () => {
  const archivedTask: Task = {
    ...baseTask,
    id: "t2",
    deletedAt: "2026-05-01T10:00:00.000Z",
  };
  useTaskStore.setState({
    tasks: [],
    archivedTasks: [archivedTask],
    loading: false,
  });
  const repo = makeRepo({
    unarchiveTask: vi.fn().mockResolvedValue(undefined),
  });
  const { result } = renderHook(() => useTaskStore());
  await act(async () => {
    await result.current.unarchiveTask(repo, "t2");
  });
  expect(result.current.archivedTasks).toHaveLength(0);
});
```

- [ ] **Step 6: Run tests to confirm they fail**

Run: `pnpm test:run -- src/store/tasks.test.ts`

Expected: 3 new tests fail with "archiveTask is not a function" / "loadArchivedTasks is not a function" / "unarchiveTask is not a function". The updated "deleteTask" test should still pass (the store currently has deleteTask).

- [ ] **Step 7: Implement the store changes**

Replace `src/store/tasks.ts` with:

```typescript
import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import { todayIso } from "@/lib/utils";
import type { CreateTaskInput, Task, TaskFilters } from "@/types";

interface TaskStore {
  tasks: Task[];
  archivedTasks: Task[];
  loading: boolean;
  allCount: number;
  todayCount: number;
  loadTasks(repo: TodoRepository, filters?: TaskFilters): Promise<void>;
  loadArchivedTasks(repo: TodoRepository): Promise<void>;
  refreshCounts(repo: TodoRepository): Promise<void>;
  createTask(repo: TodoRepository, input: CreateTaskInput): Promise<Task>;
  updateTask(
    repo: TodoRepository,
    id: string,
    patch: Partial<CreateTaskInput>,
  ): Promise<void>;
  completeTask(repo: TodoRepository, id: string): Promise<void>;
  uncompleteTask(repo: TodoRepository, id: string): Promise<void>;
  archiveTask(repo: TodoRepository, id: string): Promise<void>;
  deleteTask(repo: TodoRepository, id: string): Promise<void>;
  unarchiveTask(repo: TodoRepository, id: string): Promise<void>;
  reorderTasks(repo: TodoRepository, orderedIds: string[]): Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  archivedTasks: [],
  loading: false,
  allCount: 0,
  todayCount: 0,

  async refreshCounts(repo) {
    const [all, today] = await Promise.all([
      repo.getTasks(),
      repo.getTasks({ dueBefore: todayIso() }),
    ]);
    set({ allCount: all.length, todayCount: today.length });
  },

  async loadTasks(repo, filters) {
    set({ loading: true });
    const [tasks] = await Promise.all([
      repo.getTasks(filters),
      get().refreshCounts(repo),
    ]);
    set({ tasks, loading: false });
  },

  async loadArchivedTasks(repo) {
    const archivedTasks = await repo.getArchivedTasks();
    set({ archivedTasks });
  },

  async createTask(repo, input) {
    const task = await repo.createTask(input);
    set((s) => ({ tasks: [task, ...s.tasks] }));
    get().refreshCounts(repo);
    return task;
  },

  async updateTask(repo, id, patch) {
    const updated = await repo.updateTask(id, patch);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
    get().refreshCounts(repo);
  },

  async completeTask(repo, id) {
    const updated = await repo.completeTask(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
    get().refreshCounts(repo);
  },

  async uncompleteTask(repo, id) {
    const updated = await repo.uncompleteTask(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
    get().refreshCounts(repo);
  },

  async archiveTask(repo, id) {
    await repo.archiveTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    get().refreshCounts(repo);
  },

  async deleteTask(repo, id) {
    await repo.deleteTask(id);
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      archivedTasks: s.archivedTasks.filter((t) => t.id !== id),
    }));
    get().refreshCounts(repo);
  },

  async unarchiveTask(repo, id) {
    await repo.unarchiveTask(id);
    set((s) => ({
      archivedTasks: s.archivedTasks.filter((t) => t.id !== id),
    }));
  },

  async reorderTasks(repo, orderedIds) {
    const prev = get().tasks;
    set((s) => {
      const byId = new Map(s.tasks.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, sortOrder: i } : null;
        })
        .filter(Boolean) as Task[];
      const rest = s.tasks.filter((t) => !orderedIds.includes(t.id));
      return { tasks: [...reordered, ...rest] };
    });
    try {
      await repo.reorderTasks(orderedIds);
    } catch (e) {
      set({ tasks: prev });
      throw e;
    }
  },
}));
```

- [ ] **Step 8: Run tests — all should pass**

Run: `pnpm test:run -- src/store/tasks.test.ts`

Expected: all tests pass (green). Verify the 3 new tests and the renamed deleteTask test all pass.

---

### Task 5: TaskItem context menu

**Files:**

- Modify: `src/components/tasks/TaskItem.tsx`

- [ ] **Step 1: Add archive import and handler**

Update the imports line for lucide-react — add `Archive`:

```typescript
import { Archive, GripVertical, Trash2, TriangleAlert } from "lucide-react";
```

Update the store destructuring to include `archiveTask`:

```typescript
const { completeTask, uncompleteTask, deleteTask, archiveTask, updateTask } =
  useTaskStore();
```

Add a `handleArchive` function right after `handleDelete`:

```typescript
async function handleDelete() {
  await deleteTask(getRepository(), task.id);
}

async function handleArchive() {
  await archiveTask(getRepository(), task.id);
}
```

- [ ] **Step 2: Update the context menu**

Replace the `<ContextMenuContent>` block:

```tsx
<ContextMenuContent>
  <ContextMenuItem onClick={handleArchive}>
    <Archive className="h-4 w-4" />
    {t("task.archive")}
  </ContextMenuItem>
  <ContextMenuItem variant="destructive" onClick={handleDelete}>
    <Trash2 className="h-4 w-4" />
    {t("common.delete")}
  </ContextMenuItem>
  <ContextMenuSeparator />
  <ContextMenuGroupLabel>{t("tag.tags")}</ContextMenuGroupLabel>
  {visibleTags.length === 0 ? (
    <p className="px-1.5 py-1 text-xs text-muted-foreground">
      {t("tag.noTags")}
    </p>
  ) : (
    visibleTags.map((tag) => (
      <ContextMenuCheckboxItem
        key={tag.id}
        checked={task.tags.some((t) => t.id === tag.id)}
        onCheckedChange={(checked) => handleTagToggle(tag.id, checked)}
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: tag.color ?? "var(--muted-foreground)" }}
        />
        <span className="truncate">{tag.name}</span>
      </ContextMenuCheckboxItem>
    ))
  )}
</ContextMenuContent>
```

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm build 2>&1 | head -30`

Expected: no errors.

---

### Task 6: TaskDetail panel

**Files:**

- Modify: `src/components/layout/TaskDetail.tsx`

- [ ] **Step 1: Update imports**

Add `Archive` to the lucide-react import:

```typescript
import { Archive, CheckCircle, Circle, Trash2, X } from "lucide-react";
```

Update the store destructuring to include `archiveTask`:

```typescript
const {
  tasks,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  archiveTask,
} = useTaskStore();
```

- [ ] **Step 2: Add `handleArchive`**

Add this function right after `handleDelete`:

```typescript
async function handleDelete() {
  await deleteTask(repo, taskId);
  setSelectedTask(null);
}

async function handleArchive() {
  await archiveTask(repo, taskId);
  setSelectedTask(null);
}
```

- [ ] **Step 3: Update the Actions section**

Replace the `{/* Actions */}` block:

```tsx
{
  /* Actions */
}
<div className="p-3 mt-auto flex flex-col gap-1">
  <Button
    variant="ghost"
    size="sm"
    className="gap-2 w-full justify-start"
    onClick={handleArchive}
  >
    <Archive className="h-4 w-4" />
    {t("task.archive")}
  </Button>
  <Button
    variant="ghost"
    size="sm"
    className="gap-2 text-destructive hover:text-destructive w-full justify-start"
    onClick={handleDelete}
  >
    <Trash2 className="h-4 w-4" />
    {t("task.delete")}
  </Button>
</div>;
```

---

### Task 7: ArchiveView component

**Files:**

- Create: `src/components/layout/ArchiveView.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";

export function ArchiveView() {
	const { archivedTasks, loadArchivedTasks, unarchiveTask, deleteTask } =
		useTaskStore();
	const projects = useProjectStore((s) => s.projects);
	const { t, i18n } = useTranslation();
	const repo = getRepository();

	useEffect(() => {
		loadArchivedTasks(repo);
	}, []);

	return (
		<div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
			<div className="px-6 py-5 border-b border-border shrink-0">
				<h2 className="text-lg font-semibold">{t("nav.archives")}</h2>
			</div>
			<ScrollArea className="flex-1">
				{archivedTasks.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						{t("archive.empty")}
					</div>
				) : (
					<div className="flex flex-col gap-1 p-3">
						{archivedTasks.map((task) => {
							const project = projects.find((p) => p.id === task.projectId);
							return (
								<div
									key={task.id}
									className="flex items-center gap-3 mx-0 my-1 pl-3 pr-2 py-2.5 rounded-xl border glass-card"
								>
									<div className="flex-1 min-w-0">
										<p className="text-sm truncate line-through text-muted-foreground">
											{task.title}
										</p>
										<p className="text-xs text-muted-foreground/60 mt-0.5">
											{project?.name && (
												<span className="mr-2">{project.name}</span>
											)}
											{task.deletedAt &&
												t("archive.archivedOn", {
													date: formatDate(
														task.deletedAt.slice(0, 10),
														i18n.language,
													),
												})}
										</p>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
										onClick={() => unarchiveTask(repo, task.id)}
										aria-label={t("task.restore")}
									>
										<RotateCcw className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
										onClick={() => deleteTask(repo, task.id)}
										aria-label={t("common.delete")}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build 2>&1 | head -30`

Expected: no errors.

---

### Task 8: Sidebar + AppShell wiring

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add Archives nav item to Sidebar**

In `src/components/layout/Sidebar.tsx`, add `ArchiveX` to the lucide-react import (after `CalendarDays`):

```typescript
import {
  ArchiveX,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  Settings2,
  Tags,
  Trash2,
} from "lucide-react";
```

In the views section of the sidebar (after the Calendar `<NavItem>`), add:

```tsx
<NavItem
  icon={<ArchiveX className="h-4 w-4" />}
  label={t("nav.archives")}
  active={selectedProjectId === "archives"}
  collapsed={sidebarCollapsed}
  onClick={() => setSelectedProject("archives")}
/>
```

- [ ] **Step 2: Wire ArchiveView in AppShell**

In `src/components/layout/AppShell.tsx`, add the import:

```typescript
import { ArchiveView } from "@/components/layout/ArchiveView";
```

Update `renderMainPanel`:

```typescript
function renderMainPanel() {
    if (selectedProjectId === "tags") return <TagManager />;
    if (selectedProjectId === "calendar") return <CalendarView />;
    if (selectedProjectId === "archives") return <ArchiveView />;
    return <TaskList />;
}
```

Also update `showDetail` to hide the task detail panel when in archives:

```typescript
const showDetail =
  selectedTaskId &&
  selectedProjectId !== "tags" &&
  selectedProjectId !== "archives";
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test:run`

Expected: all tests pass.

---

## Done

The feature is complete when:

- Right-clicking a task shows "Archive task" above "Delete" in the context menu
- TaskDetail panel shows "Archive task" button above "Delete task"
- "Archives" appears in the sidebar navigation
- Clicking "Archives" shows all archived tasks with restore (↺) and delete (🗑) actions
- Restoring a task removes it from the archive view; it reappears when navigating to any task list
- Deleting from the archive view permanently removes the task from the database
