# Copy Task Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy title" item to the task right-click context menu that writes the task title to the system clipboard.

**Architecture:** Three file changes — add i18n keys to both locale files, then add the menu item and handler to `TaskItem.tsx`. No store changes needed; clipboard write is a local side effect.

**Tech Stack:** React, lucide-react (icons), react-i18next (i18n), @testing-library/react + vitest (tests)

---

### Task 1: Add i18n keys

**Files:**

- Modify: `src/i18n/locales/en.ts:44-59` (task namespace)
- Modify: `src/i18n/locales/fr.ts:46-61` (task namespace)

- [ ] **Step 1: Add key to English locale**

In `src/i18n/locales/en.ts`, inside the `task` object, add `copyTitle` after the `search` key:

```ts
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
  copyTitle: "Copy title",
},
```

- [ ] **Step 2: Add key to French locale**

In `src/i18n/locales/fr.ts`, inside the `task` object, add `copyTitle` after the `search` key:

```ts
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
  copyTitle: "Copier le titre",
},
```

---

### Task 2: Add copy handler and menu item to TaskItem

**Files:**

- Modify: `src/components/tasks/TaskItem.tsx`
- Test: `src/test/TaskItem.test.tsx` (new file)

- [ ] **Step 1: Write failing test**

Create `src/test/TaskItem.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { vi } from "vitest";
import { TaskItem } from "@/components/tasks/TaskItem";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";

vi.mock("@/store/repository", () => ({
  getRepository: vi.fn(() => ({})),
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

const mockTask: Task = {
  id: "task-1",
  title: "Buy groceries",
  description: null,
  projectId: null,
  priority: "none",
  dueDate: null,
  completedAt: null,
  deletedAt: null,
  tags: [],
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useTaskStore.setState({ allCount: 0, todayCount: 0 });
  useTagStore.setState({ tags: [] });
  useUIStore.setState({
    selectedTaskId: null,
    setSelectedTask: vi.fn(),
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
  });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

it("copies task title to clipboard when 'Copy title' is clicked", async () => {
  const user = userEvent.setup();
  render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

  await user.pointer({
    keys: "[MouseRight]",
    target: screen.getByText("Buy groceries"),
  });
  await user.click(await screen.findByText("Copy title"));

  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Buy groceries");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/test/TaskItem.test.tsx
```

Expected: FAIL — `Copy title` menu item not found.

- [ ] **Step 3: Add `Copy` import and handler to TaskItem**

In `src/components/tasks/TaskItem.tsx`, update the lucide-react import (line 3) to include `Copy`:

```ts
import {
  Archive,
  Copy,
  GripVertical,
  Trash2,
  TriangleAlert,
} from "lucide-react";
```

Add `handleCopyTitle` function after `handleArchive` (after line 76):

```ts
function handleCopyTitle() {
  navigator.clipboard.writeText(task.title);
}
```

- [ ] **Step 4: Add the menu item to the context menu**

Replace the `<ContextMenuContent>` block (lines 183–217) with:

```tsx
<ContextMenuContent>
  <ContextMenuItem onClick={handleCopyTitle}>
    <Copy className="h-4 w-4" />
    {t("task.copyTitle")}
  </ContextMenuItem>
  <ContextMenuSeparator />
  <ContextMenuItem onClick={handleArchive}>
    <Archive className="h-4 w-4" />
    {t("task.archive")}
  </ContextMenuItem>
  <ContextMenuItem
    variant="destructive"
    closeOnClick={false}
    onClick={() => onDeleteRequest(task.id)}
  >
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

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/test/TaskItem.test.tsx
```

Expected: PASS — "Copy title" item found and clipboard called with task title.

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass, no regressions.
