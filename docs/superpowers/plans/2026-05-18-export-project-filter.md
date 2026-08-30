# Export Project Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select project filter to the export section of SettingsDialog so users can export only tasks from specific projects (including Inbox).

**Architecture:** `INBOX_PROJECT_ID` sentinel + optional `projectIds` field in `ExportOptions` drives filtering in `exportData()`; a new generic `MultiSelect` component (Popover + buttons) renders the project picker; SettingsDialog wires the two together.

**Tech Stack:** TypeScript, React, Vitest, base-ui Popover, lucide-react.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/dataTransfer.ts` | Add `INBOX_PROJECT_ID`, `projectIds` to `ExportOptions`, filter in `exportData()` |
| Modify | `src/lib/dataTransfer.test.ts` | Tests for `projectIds` filter combinations |
| Create | `src/components/ui/multi-select.tsx` | Generic multi-select Popover component |
| Modify | `src/i18n/locales/en.ts` | Add `data.allProjects` key |
| Modify | `src/i18n/locales/fr.ts` | Add `data.allProjects` key |
| Modify | `src/components/layout/SettingsDialog.tsx` | Load projects, add MultiSelect, update type cast |

---

## Task 1: Update `dataTransfer.ts` — sentinel, ExportOptions, filter

**Files:**
- Modify: `src/lib/dataTransfer.ts`
- Test: `src/lib/dataTransfer.test.ts`

### Context

`INBOX_PROJECT_ID` is a string sentinel because `ExportOptions.projectIds` is `string[] | null` — using `null` as an array element would require `(string | null)[]` which complicates call sites. The field is `optional` so existing callers need no changes.

- [ ] **Step 1: Write the new tests (they will fail)**

Add a `describe("exportData — projectIds filter")` block at the end of `src/lib/dataTransfer.test.ts`:

```ts
import { INBOX_PROJECT_ID, exportData } from "./dataTransfer";

// at the end of the file, after the closing brace of the existing describe block:

describe("exportData — projectIds filter", () => {
  it("null projectIds exports all tasks", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: null,
    });
    expect(result.tasks).toHaveLength(3);
  });

  it("filters to a specific project only", async () => {
    const { repo, project } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [project.id],
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe("Active task");
  });

  it("filters to Inbox only (tasks with no project)", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [INBOX_PROJECT_ID],
    });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.projectId === null)).toBe(true);
  });

  it("filters to project + Inbox together", async () => {
    const { repo, project } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [project.id, INBOX_PROJECT_ID],
    });
    expect(result.tasks).toHaveLength(3);
  });

  it("empty projectIds array exports no tasks", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [],
    });
    expect(result.tasks).toHaveLength(0);
  });

  it("undefined projectIds exports all tasks (backwards compat)", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.tasks).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests — they must fail**

```bash
pnpm test:run -- src/lib/dataTransfer.test.ts
```

Expected: the 6 new tests fail with "INBOX_PROJECT_ID is not exported" or similar.

- [ ] **Step 3: Implement the changes in `src/lib/dataTransfer.ts`**

Replace the entire file with:

```ts
import type { TodoRepository } from "@/db/repository";
import type { Project, Tag, Task } from "@/types";

export const INBOX_PROJECT_ID = "__inbox__" as const;

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
  projectIds?: string[] | null; // undefined or null = all projects
}

export async function exportData(
  repo: TodoRepository,
  options: ExportOptions,
): Promise<ExportData> {
  const allNonArchived = await repo.getTasks({ allTasks: true });
  const archived = options.archivedTasks ? await repo.getArchivedTasks() : [];

  let tasks: Task[] = [
    ...(options.activeTasks
      ? allNonArchived.filter((t) => t.completedAt === null)
      : []),
    ...(options.completedTasks
      ? allNonArchived.filter((t) => t.completedAt !== null)
      : []),
    ...archived,
  ];

  const projectIds = options.projectIds ?? null;
  if (projectIds !== null) {
    const projectSet = new Set(projectIds);
    tasks = tasks.filter((t) =>
      t.projectId === null
        ? projectSet.has(INBOX_PROJECT_ID)
        : projectSet.has(t.projectId),
    );
  }

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

- [ ] **Step 4: Run the tests — all must pass**

```bash
pnpm test:run -- src/lib/dataTransfer.test.ts
```

Expected: 12 tests pass (6 existing + 6 new).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
pnpm exec tsc --noEmit && pnpm test:run 2>&1 | tail -8
```

Expected: TypeScript clean, all tests pass.

---

## Task 2: Create `src/components/ui/multi-select.tsx`

**Files:**
- Create: `src/components/ui/multi-select.tsx`

No unit tests for this task — it is a purely presentational component with no business logic.

### Context

- Uses `Popover` / `PopoverTrigger` / `PopoverContent` from `@/components/ui/popover` (base-ui).
- `PopoverTrigger` accepts a `render` prop (base-ui pattern) — passing a `Button` element applies the trigger's event handlers (aria-haspopup, onClick) onto the button.
- The "Tous" option calls `onChange(null)`; selecting any item when `value === null` initialises a single-item array; deselecting the last item resets to `null`.
- `itemsLabel` is an optional suffix for the trigger label when ≥ 3 items are selected (e.g. `"projets"` → `"3 projets"`).

- [ ] **Step 1: Create the component**

Create `src/components/ui/multi-select.tsx` with the full content below:

```tsx
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  allLabel: string;
  itemsLabel?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  allLabel,
  itemsLabel,
}: MultiSelectProps) {
  function triggerLabel(): string {
    if (value === null) return allLabel;
    if (value.length === 0) return allLabel;
    if (value.length === 1) {
      return options.find((o) => o.value === value[0])?.label ?? value[0];
    }
    if (value.length === 2) {
      return value
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(", ");
    }
    return itemsLabel ? `${value.length} ${itemsLabel}` : String(value.length);
  }

  function handleToggle(optionValue: string) {
    if (value === null) {
      onChange([optionValue]);
      return;
    }
    const next = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange(next.length === 0 ? null : next);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 font-normal">
            <span className="line-clamp-1 max-w-48">{triggerLabel()}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent className="w-52 p-1" align="start">
        {/* "Tous" / all option */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <span className="flex-1 text-left">{allLabel}</span>
          {value === null && <Check className="size-3.5 shrink-0" />}
        </button>
        <div className="my-1 h-px bg-border" />
        {options.map((option) => {
          const checked = value !== null && value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleToggle(option.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              <span className="flex-1 text-left">{option.label}</span>
              {checked && <Check className="size-3.5 shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 3: i18n + SettingsDialog integration

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`
- Modify: `src/components/layout/SettingsDialog.tsx`

### Context

- `useProjectStore` is already available via `@/store/projects`.
- `exportOptions.projectIds` is `string[] | null | undefined` (optional field). Use `?? null` when passing to `MultiSelect`.
- The checkbox loop's type cast must be narrowed to only the boolean fields of `ExportOptions` — otherwise `exportOptions[key]` would include `string[] | null` which is not assignable to `Checkbox.checked: boolean`.
- The `MultiSelect` sits between the checkboxes `</div>` and the Export `<Button>`.

- [ ] **Step 1: Add `allProjects` to `src/i18n/locales/en.ts`**

In `src/i18n/locales/en.ts`, inside the `data` object, add after `exportTags`:

```ts
allProjects: "All projects",
```

Full `data` block after change:

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
  allProjects: "All projects",
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

- [ ] **Step 2: Add `allProjects` to `src/i18n/locales/fr.ts`**

Same location, French value:

```ts
allProjects: "Tous les projets",
```

Full `data` block after change:

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
  allProjects: "Tous les projets",
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

- [ ] **Step 3: Update imports in `src/components/layout/SettingsDialog.tsx`**

Current import from `@/lib/dataTransfer` (lines 27–31):
```ts
import {
  type ExportData,
  type ExportOptions,
  exportData,
} from "@/lib/dataTransfer";
```

Replace with:
```ts
import {
  INBOX_PROJECT_ID,
  type ExportData,
  type ExportOptions,
  exportData,
} from "@/lib/dataTransfer";
import { MultiSelect } from "@/components/ui/multi-select";
import { useProjectStore } from "@/store/projects";
```

- [ ] **Step 4: Add `projectIds` to initial state and load projects**

Current state block (around line 365):
```ts
const [exportOptions, setExportOptions] = useState<ExportOptions>({
  activeTasks: true,
  completedTasks: true,
  archivedTasks: true,
  projects: true,
  tags: true,
});
```

Replace with:
```ts
const projects = useProjectStore((s) => s.projects);

const [exportOptions, setExportOptions] = useState<ExportOptions>({
  activeTasks: true,
  completedTasks: true,
  archivedTasks: true,
  projects: true,
  tags: true,
  projectIds: null,
});
```

- [ ] **Step 5: Fix the checkboxes type cast and add the MultiSelect**

The existing checkboxes block (lines ~751–778) uses `keyof ExportOptions` which now includes `projectIds`. Narrow it to the boolean fields only, and insert the `MultiSelect` between the checkboxes `</div>` and the Export button.

Current block:
```tsx
<div className="flex flex-col gap-1.5 pl-1">
  {(
    [
      ["activeTasks", "data.activeTasks"],
      ["completedTasks", "data.completedTasks"],
      ["archivedTasks", "data.archivedTasks"],
      ["projects", "data.exportProjects"],
      ["tags", "data.exportTags"],
    ] as [keyof ExportOptions, "data.activeTasks" | "data.completedTasks" | "data.archivedTasks" | "data.exportProjects" | "data.exportTags"][]
  ).map(([key, labelKey]) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox
    <label
      key={key}
      className="flex items-center gap-2 cursor-pointer select-none"
    >
      <Checkbox
        checked={exportOptions[key]}
        onCheckedChange={(checked) =>
          setExportOptions((prev) => ({
            ...prev,
            [key]: checked === true,
          }))
        }
      />
      <span className="text-sm">{t(labelKey)}</span>
    </label>
  ))}
</div>
<Button
  variant="outline"
  size="sm"
  className="w-fit"
  onClick={handleExport}
>
  {t("data.export")}
</Button>
```

Replace with:
```tsx
<div className="flex flex-col gap-1.5 pl-1">
  {(
    [
      ["activeTasks", "data.activeTasks"],
      ["completedTasks", "data.completedTasks"],
      ["archivedTasks", "data.archivedTasks"],
      ["projects", "data.exportProjects"],
      ["tags", "data.exportTags"],
    ] as ["activeTasks" | "completedTasks" | "archivedTasks" | "projects" | "tags", "data.activeTasks" | "data.completedTasks" | "data.archivedTasks" | "data.exportProjects" | "data.exportTags"][]
  ).map(([key, labelKey]) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox
    <label
      key={key}
      className="flex items-center gap-2 cursor-pointer select-none"
    >
      <Checkbox
        checked={exportOptions[key]}
        onCheckedChange={(checked) =>
          setExportOptions((prev) => ({
            ...prev,
            [key]: checked === true,
          }))
        }
      />
      <span className="text-sm">{t(labelKey)}</span>
    </label>
  ))}
</div>
<MultiSelect
  options={[
    { value: INBOX_PROJECT_ID, label: t("nav.inbox") },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]}
  value={exportOptions.projectIds ?? null}
  onChange={(value) =>
    setExportOptions((prev) => ({ ...prev, projectIds: value }))
  }
  allLabel={t("data.allProjects")}
  itemsLabel={t("data.exportProjects")}
/>
<Button
  variant="outline"
  size="sm"
  className="w-fit"
  onClick={handleExport}
>
  {t("data.export")}
</Button>
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Run the full test suite**

```bash
pnpm test:run 2>&1 | tail -8
```

Expected: all tests pass (≥ 215 tests).
