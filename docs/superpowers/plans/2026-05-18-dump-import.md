# Dump / Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add export and import of tasks, projects, and tags as a JSON file via Tauri native file dialogs, with merge or replace strategy on import.

**Architecture:** A pure `dataTransfer.ts` module handles serialisation/deserialisation; a new `bulkImport` method on `TodoRepository` (SQLite + Memory) handles persistence; the UI lives in a new "Données" section inside the existing `SettingsDialog`, with a separate `ImportConfirmDialog` for strategy choice.

**Tech Stack:** TypeScript, React, Vitest, `@tauri-apps/plugin-dialog` (save/open), `@tauri-apps/plugin-fs` (readTextFile/writeTextFile), `tauri-plugin-dialog` + `tauri-plugin-fs` (Rust crates).

---

## File Map

| Action | Path                                            | Responsibility                                      |
| ------ | ----------------------------------------------- | --------------------------------------------------- |
| Modify | `src-tauri/Cargo.toml`                          | Add `tauri-plugin-dialog`, `tauri-plugin-fs` crates |
| Modify | `src-tauri/src/lib.rs`                          | Register both plugins                               |
| Modify | `src-tauri/capabilities/default.json`           | Add `dialog:default`, `fs:default` permissions      |
| Modify | `src/i18n/locales/en.ts`                        | Add `data` key group                                |
| Modify | `src/i18n/locales/fr.ts`                        | Add `data` key group                                |
| Create | `src/lib/dataTransfer.ts`                       | `ExportData`, `ExportOptions`, `exportData()`       |
| Modify | `src/db/repository.ts`                          | Add `bulkImport` to `TodoRepository` interface      |
| Modify | `src/db/sqlite-repository.ts`                   | Implement `bulkImport`                              |
| Modify | `src/test-harness/MemoryRepository.ts`          | Implement `bulkImport`                              |
| Create | `src/components/layout/ImportConfirmDialog.tsx` | Strategy-choice confirmation dialog                 |
| Modify | `src/components/layout/SettingsDialog.tsx`      | Add "Données" section                               |

---

## Task 1: Tauri plugin setup

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Rust crates to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

Full `[dependencies]` block after change:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-notification = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Register plugins in lib.rs**

In `src-tauri/src/lib.rs`, in the `run()` function, add the two `.plugin(...)` calls:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![send_app_notification])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Add permissions to capabilities**

Replace the contents of `src-tauri/capabilities/default.json`:

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
    "sql:allow-close",
    "notification:default",
    "opener:default",
    "dialog:default",
    "fs:default"
  ]
}
```

- [ ] **Step 4: Install JS packages**

```bash
pnpm add @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

- [ ] **Step 5: Verify the Rust build compiles**

```bash
pnpm tauri build --no-bundle 2>&1 | tail -20
```

Expected: no compilation errors. (Warning: this takes ~1–2 minutes on first build with new crates.)

---

## Task 2: i18n keys

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Add `data` key group to en.ts**

In `src/i18n/locales/en.ts`, before the closing `};`, add after `archive`:

```ts
  data: {
    title: "Data",
    exportSection: "Export",
    importSection: "Import",
    activeTasks: "Active tasks",
    completedTasks: "Completed tasks",
    archivedTasks: "Archived tasks",
    exportProjects: "Projects",
    exportTags: "Tags",
    export: "Export",
    import: "Import",
    importConfirmTitle: "Import data",
    importSummary: "{{tasks}} tasks, {{projects}} projects, {{tags}} tags",
    merge: "Merge",
    replace: "Replace",
    replaceWarning: "All your current data will be permanently deleted.",
    exportError: "Export failed",
    importError: "Invalid or corrupted file",
  },
```

- [ ] **Step 2: Add `data` key group to fr.ts**

In `src/i18n/locales/fr.ts`, add the matching block after `archive`:

```ts
  data: {
    title: "Données",
    exportSection: "Exporter",
    importSection: "Importer",
    activeTasks: "Tâches actives",
    completedTasks: "Tâches complétées",
    archivedTasks: "Tâches archivées",
    exportProjects: "Projets",
    exportTags: "Tags",
    export: "Exporter",
    import: "Importer",
    importConfirmTitle: "Importer les données",
    importSummary: "{{tasks}} tâches, {{projects}} projets, {{tags}} tags",
    merge: "Fusionner",
    replace: "Remplacer",
    replaceWarning: "Toutes vos données actuelles seront supprimées définitivement.",
    exportError: "Échec de l'export",
    importError: "Fichier invalide ou corrompu",
  },
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors (the `fr` type is `typeof en`, so adding the key to both keeps them in sync).

---

## Task 3: dataTransfer.ts — types and exportData

**Files:**

- Create: `src/lib/dataTransfer.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dataTransfer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import { exportData } from "./dataTransfer";

async function seedRepo() {
  const repo = new MemoryRepository();
  const project = await repo.createProject({ name: "Work", color: "#f00" });
  const tag = await repo.createTag({ name: "urgent", color: "#0f0" });
  await repo.createTask({
    title: "Active task",
    projectId: project.id,
    tagIds: [tag.id],
  });
  const completedTask = await repo.createTask({ title: "Done task" });
  await repo.completeTask(completedTask.id);
  const archivedTask = await repo.createTask({ title: "Archived task" });
  await repo.archiveTask(archivedTask.id);
  return { repo, project, tag };
}

describe("exportData", () => {
  it("exports all data when all options are true", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.version).toBe(1);
    expect(result.tasks).toHaveLength(3);
    expect(result.projects).toHaveLength(1);
    expect(result.tags).toHaveLength(1);
    expect(typeof result.exportedAt).toBe("string");
  });

  it("excludes active tasks when activeTasks is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: false,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(
      result.tasks.every((t) => t.completedAt !== null || t.deletedAt !== null),
    ).toBe(true);
    expect(result.tasks).toHaveLength(2);
  });

  it("excludes completed tasks when completedTasks is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: false,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.tasks.every((t) => t.completedAt === null)).toBe(true);
    expect(result.tasks).toHaveLength(2);
  });

  it("excludes archived tasks when archivedTasks is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: false,
      projects: true,
      tags: true,
    });
    expect(result.tasks.every((t) => t.deletedAt === null)).toBe(true);
    expect(result.tasks).toHaveLength(2);
  });

  it("excludes projects when projects is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: false,
      tags: true,
    });
    expect(result.projects).toHaveLength(0);
  });

  it("excludes tags when tags is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: false,
    });
    expect(result.tags).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test:run src/lib/dataTransfer.test.ts 2>&1 | tail -15
```

Expected: `FAIL` — `exportData` is not defined.

- [ ] **Step 3: Create src/lib/dataTransfer.ts**

```ts
import type { TodoRepository } from "@/db/repository";
import type { Project, Tag, Task } from "@/types";

export interface ExportData {
  version: 1;
  exportedAt: string;
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
}

export interface ExportOptions {
  activeTasks: boolean;
  completedTasks: boolean;
  archivedTasks: boolean;
  projects: boolean;
  tags: boolean;
}

export async function exportData(
  repo: TodoRepository,
  options: ExportOptions,
): Promise<ExportData> {
  const allNonArchived = await repo.getTasks({ allTasks: true });
  const archived = options.archivedTasks ? await repo.getArchivedTasks() : [];

  const tasks: Task[] = [
    ...(options.activeTasks
      ? allNonArchived.filter((t) => t.completedAt === null)
      : []),
    ...(options.completedTasks
      ? allNonArchived.filter((t) => t.completedAt !== null)
      : []),
    ...archived,
  ];

  const projects: Project[] = options.projects ? await repo.getProjects() : [];
  const tags: Tag[] = options.tags ? await repo.getTags() : [];

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    tags,
    tasks,
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test:run src/lib/dataTransfer.test.ts 2>&1 | tail -10
```

Expected: `PASS` — 6 tests passing.

---

## Task 4: bulkImport — interface and MemoryRepository

**Files:**

- Modify: `src/db/repository.ts`
- Modify: `src/test-harness/MemoryRepository.ts`

- [ ] **Step 1: Add bulkImport to the TodoRepository interface**

In `src/db/repository.ts`, add to the imports:

```ts
import type { ExportData } from "@/lib/dataTransfer";
```

Add to the `TodoRepository` interface (after `reorderTasks`):

```ts
bulkImport(data: ExportData, strategy: "merge" | "replace"): Promise<void>;
```

- [ ] **Step 2: Verify TypeScript reports missing implementations**

```bash
pnpm exec tsc --noEmit 2>&1 | grep "bulkImport" | head -5
```

Expected: errors about `SqliteRepository` and `MemoryRepository` not implementing `bulkImport`.

- [ ] **Step 3: Implement bulkImport in MemoryRepository**

In `src/test-harness/MemoryRepository.ts`, add import at the top:

```ts
import type { ExportData } from "@/lib/dataTransfer";
```

Add this method to the `MemoryRepository` class (after `reorderTasks`):

```ts
async bulkImport(
  data: ExportData,
  strategy: "merge" | "replace",
): Promise<void> {
  if (strategy === "replace") {
    this.tasks.clear();
    this.tags.clear();
    this.projects.clear();
  }

  for (const project of data.projects) {
    this.projects.set(project.id, project);
  }

  for (const tag of data.tags) {
    this.tags.set(tag.id, tag);
  }

  for (const task of data.tasks) {
    // Resolve tag references from imported tags map
    const resolvedTags = task.tags
      .map((t) => this.tags.get(t.id) ?? t)
      .filter(Boolean);
    this.tasks.set(task.id, { ...task, tags: resolvedTags });
  }
}
```

- [ ] **Step 4: Verify TypeScript no longer reports MemoryRepository error**

```bash
pnpm exec tsc --noEmit 2>&1 | grep "MemoryRepository" | head -5
```

Expected: no errors about `MemoryRepository`.

---

## Task 5: SqliteRepository.bulkImport — tests and implementation

**Files:**

- Modify: `src/db/sqlite-repository.ts`
- Modify: `src/db/sqlite-repository.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/db/sqlite-repository.test.ts`:

```ts
import type { ExportData } from "@/lib/dataTransfer";

const sampleExportData: ExportData = {
  version: 1,
  exportedAt: "2026-05-18T10:00:00.000Z",
  projects: [
    {
      id: "p1",
      name: "Work",
      color: "#f00",
      icon: null,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  tags: [{ id: "t1", name: "urgent", color: "#0f0", projectId: null }],
  tasks: [
    {
      id: "task1",
      title: "Hello",
      description: null,
      projectId: "p1",
      priority: "high",
      dueDate: null,
      completedAt: null,
      deletedAt: null,
      tags: [{ id: "t1", name: "urgent", color: "#0f0", projectId: null }],
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("SqliteRepository — bulkImport", () => {
  it("merge: calls INSERT OR REPLACE for each entity without DELETE", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.bulkImport(sampleExportData, "merge");

    const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as string).trim().toUpperCase(),
    );
    expect(
      calls.some((s: string) => s.startsWith("DELETE FROM PROJECTS")),
    ).toBe(false);
    expect(calls.some((s: string) => s.startsWith("DELETE FROM TASKS"))).toBe(
      false,
    );
    expect(
      calls.some((s: string) => s.includes("INSERT OR REPLACE INTO PROJECTS")),
    ).toBe(true);
    expect(
      calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TAGS")),
    ).toBe(true);
    expect(
      calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TASKS")),
    ).toBe(true);
    expect(
      calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TASK_TAGS")),
    ).toBe(true);
  });

  it("merge: deletes existing task_tags for each task before reinserting", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.bulkImport(sampleExportData, "merge");

    const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as string).trim().toUpperCase(),
    );
    expect(
      calls.some((s: string) =>
        s.startsWith("DELETE FROM TASK_TAGS WHERE TASK_ID"),
      ),
    ).toBe(true);
  });

  it("replace: runs DELETE statements before inserting", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.bulkImport(sampleExportData, "replace");

    const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as string).trim().toUpperCase(),
    );
    expect(
      calls.some((s: string) => s.startsWith("DELETE FROM TASK_TAGS")),
    ).toBe(true);
    expect(calls.some((s: string) => s.startsWith("DELETE FROM TASKS"))).toBe(
      true,
    );
    expect(calls.some((s: string) => s.startsWith("DELETE FROM TAGS"))).toBe(
      true,
    );
    expect(
      calls.some((s: string) => s.startsWith("DELETE FROM PROJECTS")),
    ).toBe(true);
    expect(
      calls.some((s: string) => s.includes("INSERT OR REPLACE INTO PROJECTS")),
    ).toBe(true);
  });

  it("replace: DELETE statements appear before INSERT statements", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.bulkImport(sampleExportData, "replace");

    const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as string).trim().toUpperCase(),
    );
    const firstDeleteIdx = calls.findIndex((s: string) =>
      s.startsWith("DELETE FROM"),
    );
    const firstInsertIdx = calls.findIndex((s: string) =>
      s.includes("INSERT OR REPLACE"),
    );
    expect(firstDeleteIdx).toBeLessThan(firstInsertIdx);
  });

  it("wraps operations in a transaction (BEGIN + COMMIT)", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.bulkImport(sampleExportData, "merge");

    const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as string).trim().toUpperCase(),
    );
    expect(calls[0]).toBe("BEGIN TRANSACTION");
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("rolls back and rethrows on error", async () => {
    const db = makeDb({
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error("disk full")), // first INSERT
    });
    const repo = new SqliteRepository(db);
    await expect(repo.bulkImport(sampleExportData, "merge")).rejects.toThrow(
      "disk full",
    );

    const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => (c[0] as string).trim().toUpperCase(),
    );
    expect(calls.some((s: string) => s === "ROLLBACK")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test:run src/db/sqlite-repository.test.ts 2>&1 | tail -15
```

Expected: `FAIL` — `bulkImport` not implemented.

- [ ] **Step 3: Implement bulkImport in SqliteRepository**

In `src/db/sqlite-repository.ts`, add import at the top:

```ts
import type { ExportData } from "@/lib/dataTransfer";
```

Add this method to the `SqliteRepository` class (before the `_attachTags` private method):

```ts
async bulkImport(
  data: ExportData,
  strategy: "merge" | "replace",
): Promise<void> {
  await this.db.execute("BEGIN TRANSACTION", []);
  try {
    if (strategy === "replace") {
      await this.db.execute("DELETE FROM task_tags", []);
      await this.db.execute("DELETE FROM tasks", []);
      await this.db.execute("DELETE FROM tags", []);
      await this.db.execute("DELETE FROM projects", []);
    }

    for (const p of data.projects) {
      await this.db.execute(
        "INSERT OR REPLACE INTO projects (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [p.id, p.name, p.color, p.icon, p.sortOrder, p.createdAt, p.updatedAt],
      );
    }

    for (const tag of data.tags) {
      await this.db.execute(
        "INSERT OR REPLACE INTO tags (id, name, color, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [tag.id, tag.name, tag.color, tag.projectId, data.exportedAt, data.exportedAt],
      );
    }

    for (const task of data.tasks) {
      await this.db.execute(
        "INSERT OR REPLACE INTO tasks (id, title, description, project_id, priority, due_date, completed_at, deleted_at, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          task.id,
          task.title,
          task.description,
          task.projectId,
          task.priority,
          task.dueDate,
          task.completedAt,
          task.deletedAt,
          task.sortOrder,
          task.createdAt,
          task.updatedAt,
        ],
      );
      await this.db.execute(
        "DELETE FROM task_tags WHERE task_id = ?",
        [task.id],
      );
      for (const tag of task.tags) {
        await this.db.execute(
          "INSERT OR REPLACE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
          [task.id, tag.id],
        );
      }
    }

    await this.db.execute("COMMIT", []);
  } catch (e) {
    await this.db.execute("ROLLBACK", []);
    throw e;
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test:run src/db/sqlite-repository.test.ts 2>&1 | tail -10
```

Expected: `PASS` — all tests including the new `bulkImport` suite.

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
pnpm exec tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

---

## Task 6: ImportConfirmDialog component

**Files:**

- Create: `src/components/layout/ImportConfirmDialog.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/layout/ImportConfirmDialog.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExportData } from "@/lib/dataTransfer";

interface ImportConfirmDialogProps {
  readonly data: ExportData;
  readonly onConfirm: (strategy: "merge" | "replace") => void;
  readonly onCancel: () => void;
}

export function ImportConfirmDialog({
  data,
  onConfirm,
  onCancel,
}: ImportConfirmDialogProps) {
  const { t } = useTranslation();
  const [hoverReplace, setHoverReplace] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("data.importConfirmTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t("data.importSummary", {
            tasks: data.tasks.length,
            projects: data.projects.length,
            tags: data.tags.length,
          })}
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <Button variant="default" onClick={() => onConfirm("merge")}>
            {t("data.merge")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm("replace")}
            onMouseEnter={() => setHoverReplace(true)}
            onMouseLeave={() => setHoverReplace(false)}
            onFocus={() => setHoverReplace(true)}
            onBlur={() => setHoverReplace(false)}
          >
            {t("data.replace")}
          </Button>
          {hoverReplace && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {t("data.replaceWarning")}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
pnpm exec tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

---

## Task 7: SettingsDialog — "Données" section

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1: Add imports at the top of SettingsDialog.tsx**

Add these imports after the existing imports block:

```ts
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ImportConfirmDialog } from "@/components/layout/ImportConfirmDialog";
import {
  exportData,
  type ExportData,
  type ExportOptions,
} from "@/lib/dataTransfer";
```

- [ ] **Step 2: Add state for the data section inside SettingsDialog**

Inside the `SettingsDialog` component function, after the existing state declarations (after the `resetShortcuts` line), add:

```ts
const [exportOptions, setExportOptions] = useState<ExportOptions>({
  activeTasks: true,
  completedTasks: true,
  archivedTasks: true,
  projects: true,
  tags: true,
});
const [pendingImport, setPendingImport] = useState<ExportData | null>(null);
const [dataError, setDataError] = useState<string | null>(null);
```

- [ ] **Step 3: Add export and import handler functions**

Inside the `SettingsDialog` component function, after the existing handler functions (after `handleAddTime`), add:

```ts
async function handleExport() {
  setDataError(null);
  const data = await exportData(getRepository(), exportOptions);
  const today = new Date().toISOString().slice(0, 10);
  const path = await save({
    defaultPath: `usagi-backup-${today}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return;
  try {
    await writeTextFile(path, JSON.stringify(data, null, 2));
  } catch {
    setDataError(t("data.exportError"));
  }
}

async function handleImportPick() {
  setDataError(null);
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return;
  try {
    const raw = await readTextFile(path);
    const parsed = JSON.parse(raw) as ExportData;
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
      setDataError(t("data.importError"));
      return;
    }
    setPendingImport(parsed);
  } catch {
    setDataError(t("data.importError"));
  }
}

async function handleImportConfirm(strategy: "merge" | "replace") {
  if (!pendingImport) return;
  try {
    await getRepository().bulkImport(pendingImport, strategy);
    // Reload the app so all Zustand stores (tasks, projects, tags) re-hydrate from the DB
    window.location.reload();
  } catch {
    setDataError(t("data.importError"));
    setPendingImport(null);
  }
}
```

- [ ] **Step 4: Add the "Données" section to the JSX**

In the right column of the `SettingsDialog` JSX (after the closing `</div>` of the Notifications section, before the final `</div>` of the right column), add:

```tsx
<div className="h-px bg-border" />;

{
  /* Section: Data */
}
<div className="flex flex-col gap-3 pt-4">
  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
    {t("data.title")}
  </p>

  {/* Export */}
  <p className="text-xs text-muted-foreground">{t("data.exportSection")}</p>
  <div className="flex flex-col gap-1.5 pl-1">
    {(
      [
        ["activeTasks", "data.activeTasks"],
        ["completedTasks", "data.completedTasks"],
        ["archivedTasks", "data.archivedTasks"],
        ["projects", "data.exportProjects"],
        ["tags", "data.exportTags"],
      ] as [keyof ExportOptions, string][]
    ).map(([key, labelKey]) => (
      // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox
      <label
        key={key}
        className="flex items-center gap-2 cursor-pointer select-none"
      >
        <Checkbox
          checked={exportOptions[key]}
          onCheckedChange={(checked) =>
            setExportOptions((prev) => ({ ...prev, [key]: checked === true }))
          }
        />
        <span className="text-sm">{t(labelKey)}</span>
      </label>
    ))}
  </div>
  <Button variant="outline" size="sm" className="w-fit" onClick={handleExport}>
    {t("data.export")}
  </Button>

  {/* Import */}
  <p className="text-xs text-muted-foreground">{t("data.importSection")}</p>
  <Button
    variant="outline"
    size="sm"
    className="w-fit"
    onClick={handleImportPick}
  >
    {t("data.import")}
  </Button>

  {dataError && <p className="text-xs text-destructive">{dataError}</p>}
</div>;
```

- [ ] **Step 5: Render the ImportConfirmDialog when pendingImport is set**

At the very end of the `SettingsDialog` component's return statement, just before the closing `</Dialog>` tag, add:

```tsx
{
  pendingImport && (
    <ImportConfirmDialog
      data={pendingImport}
      onConfirm={handleImportConfirm}
      onCancel={() => setPendingImport(null)}
    />
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Run all unit tests**

```bash
pnpm test:run 2>&1 | tail -15
```

Expected: all existing tests pass plus the new `dataTransfer` and `bulkImport` suites.
