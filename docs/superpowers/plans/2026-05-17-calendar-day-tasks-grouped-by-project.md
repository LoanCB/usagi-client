# Calendar Day Tasks Grouped by Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `DayDetailPanel`, group tasks by project with a colored header when tasks span multiple projects; Inbox last.

**Architecture:** All grouping logic lives in `DayDetailPanel` as local derived state. `CalendarView` passes the project list from `useProjectStore`. No changes to the store, utils, or i18n.

**Tech Stack:** React, TypeScript, Zustand, Tailwind CSS

---

### Task 1: Pass `projects` from `CalendarView` to `DayDetailPanel`

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx`

- [ ] **Step 1: Add `useProjectStore` import and read `projects`**

In `src/components/calendar/CalendarView.tsx`, add the import and read projects from the store:

```tsx
// Add to existing imports at the top
import { useProjectStore } from "@/store/projects";
```

After the existing store reads (around line 22-23), add:

```tsx
const projects = useProjectStore((s) => s.projects);
```

- [ ] **Step 2: Pass `projects` to `DayDetailPanel`**

In the `<DayDetailPanel>` JSX block (lines 130-138), add the `projects` prop:

```tsx
<DayDetailPanel
  day={selectedDay}
  entry={grouped.get(selectedDay)}
  width={width}
  onClose={() => setSelectedDay(null)}
  onTaskClick={handleTaskClick}
  focusTrigger={quickAddFocusTrigger}
  projectFilter={calendarProjectFilter}
  projects={projects}
/>
```

---

### Task 2: Implement grouping and project headers in `DayDetailPanel`

**Files:**
- Modify: `src/components/calendar/DayDetailPanel.tsx`

- [ ] **Step 1: Add `Project` type import and `projects` prop**

Replace the existing imports and interface:

```tsx
import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import type { Project, Task } from "@/types";

interface DayDetailPanelProps {
  readonly day: string;
  readonly entry: { due: Task[]; completed: Task[] } | undefined;
  readonly width: number;
  readonly onClose: () => void;
  readonly onTaskClick: (task: Task) => void;
  readonly focusTrigger?: number;
  readonly projectFilter?: string | null;
  readonly projects: Project[];
}
```

Destructure the new prop:

```tsx
export function DayDetailPanel({
  day,
  entry,
  width,
  onClose,
  onTaskClick,
  focusTrigger,
  projectFilter,
  projects,
}: DayDetailPanelProps) {
```

- [ ] **Step 2: Add grouping logic after existing `due`/`completed` derivations**

After the existing lines:
```tsx
const due = entry?.due ?? [];
const completed = entry?.completed ?? [];
const hasAny = due.length > 0 || completed.length > 0;
```

Add:

```tsx
const distinctProjectIds = new Set([
  ...due.map((t) => t.projectId),
  ...completed.map((t) => t.projectId),
]);
const isMultiProject = distinctProjectIds.size > 1;

// Build per-project groups only when needed
const projectGroups: { projectId: string | null; due: Task[]; completed: Task[] }[] =
  isMultiProject
    ? (() => {
        const map = new Map<string | null, { due: Task[]; completed: Task[] }>();
        for (const task of due) {
          const pid = task.projectId;
          if (!map.has(pid)) map.set(pid, { due: [], completed: [] });
          map.get(pid)!.due.push(task);
        }
        for (const task of completed) {
          const pid = task.projectId;
          if (!map.has(pid)) map.set(pid, { due: [], completed: [] });
          map.get(pid)!.completed.push(task);
        }
        // Sort by project sortOrder, Inbox (null) last
        const ids = [...map.keys()];
        ids.sort((a, b) => {
          if (a === null) return 1;
          if (b === null) return -1;
          const pa = projects.find((p) => p.id === a)?.sortOrder ?? 0;
          const pb = projects.find((p) => p.id === b)?.sortOrder ?? 0;
          return pa - pb;
        });
        return ids.map((pid) => ({ projectId: pid, ...map.get(pid)! }));
      })()
    : [];
```

- [ ] **Step 3: Replace task rendering with conditional grouped/flat layout**

Replace the task list section inside `<div className="flex flex-col flex-1 overflow-y-auto ...">`:

```tsx
<div className="flex flex-col flex-1 overflow-y-auto px-3 py-2 gap-1">
  {!hasAny && (
    <p className="text-xs text-muted-foreground/60 text-center py-4">
      {t("calendar.noTasks")}
    </p>
  )}

  {isMultiProject
    ? projectGroups.map((group, i) => {
        const project = projects.find((p) => p.id === group.projectId);
        const isInbox = group.projectId === null;
        return (
          <div key={group.projectId ?? "inbox"} className={i > 0 ? "mt-2" : undefined}>
            <div className="flex items-center gap-1.5 px-1 mb-1">
              {!isInbox && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: project?.color ?? "#888" }}
                />
              )}
              <span className="text-xs text-muted-foreground font-medium">
                {isInbox ? t("nav.inbox") : (project?.name ?? group.projectId)}
              </span>
            </div>
            {group.due.map((task) => (
              <button
                key={task.id}
                type="button"
                title={task.title}
                onClick={() => onTaskClick(task)}
                className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors w-full"
              >
                {task.title}
              </button>
            ))}
            {group.completed.map((task) => (
              <button
                key={task.id}
                type="button"
                title={task.title}
                onClick={() => onTaskClick(task)}
                className="text-xs text-left px-2 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors w-full line-through opacity-70"
              >
                {task.title}
              </button>
            ))}
          </div>
        );
      })
    : <>
        {due.map((task) => (
          <button
            key={task.id}
            type="button"
            title={task.title}
            onClick={() => onTaskClick(task)}
            className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors w-full"
          >
            {task.title}
          </button>
        ))}
        {completed.map((task) => (
          <button
            key={task.id}
            type="button"
            title={task.title}
            onClick={() => onTaskClick(task)}
            className="text-xs text-left px-2 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors w-full line-through opacity-70"
          >
            {task.title}
          </button>
        ))}
      </>
  }
</div>
```

- [ ] **Step 4: Verify the i18n key used for Inbox**

The plan uses `t("sidebar.inbox")`. Confirm it resolves to "Inbox":

```bash
grep -n "sidebar" /Users/loancb/projects/perso/usagi-client/src/i18n/locales/fr.ts | head -5
```

Expected output includes a line with `inbox: "Inbox"` nested under a `sidebar` key. If the key path is different, update the `t()` call in step 3 to match.

- [ ] **Step 5: Type-check**

```bash
cd /Users/loancb/projects/perso/usagi-client && pnpm tsc --noEmit
```

Expected: no errors.
