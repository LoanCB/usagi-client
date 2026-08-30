# Calendar Status Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-select task state filter (non faite / en retard / terminée) to the calendar header, next to the existing project filter.

**Architecture:** A new `CalendarStatusFilter` component mirrors `CalendarProjectFilter` — same popover pattern, same prop shape. State lives in `CalendarView`, flows down through `CalendarHeader`, and is applied in the `filteredTasks` memo after the project filter.

**Tech Stack:** React, TypeScript, lucide-react, react-i18next, @testing-library/react, vitest

---

## File Map

| Action | File                                                    | Responsibility                      |
| ------ | ------------------------------------------------------- | ----------------------------------- |
| Modify | `src/i18n/locales/fr.ts`                                | French translation keys             |
| Modify | `src/i18n/locales/en.ts`                                | English translation keys            |
| Create | `src/components/calendar/CalendarStatusFilter.tsx`      | Status filter popover component     |
| Create | `src/components/calendar/CalendarStatusFilter.test.tsx` | Component tests                     |
| Modify | `src/components/calendar/CalendarView.tsx`              | State + filtering logic             |
| Modify | `src/components/calendar/CalendarHeader.tsx`            | Props + render CalendarStatusFilter |

---

### Task 1: Add i18n translation keys

**Files:**

- Modify: `src/i18n/locales/fr.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] **Step 1: Add French keys**

In `src/i18n/locales/fr.ts`, find the `calendar.filter` object (currently `{ allProjects, trigger }`) and expand it:

```ts
filter: {
  allProjects: "Tous les projets",
  trigger: "Filtre projet",
  allStatuses: "Tous les états",
  statusTrigger: "Filtre état",
  pending: "Non faite",
  overdue: "En retard",
  completed: "Terminée",
},
```

- [ ] **Step 2: Add English keys**

In `src/i18n/locales/en.ts`, same location:

```ts
filter: {
  allProjects: "All projects",
  trigger: "Project filter",
  allStatuses: "All statuses",
  statusTrigger: "Status filter",
  pending: "Not done",
  overdue: "Overdue",
  completed: "Completed",
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error|warning" | head -20
```

Expected: no new errors related to i18n keys.

---

### Task 2: Create `CalendarStatusFilter` component (TDD)

**Files:**

- Create: `src/components/calendar/CalendarStatusFilter.test.tsx`
- Create: `src/components/calendar/CalendarStatusFilter.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/calendar/CalendarStatusFilter.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { CalendarStatusFilter } from "@/components/calendar/CalendarStatusFilter";

describe("CalendarStatusFilter", () => {
  it("trigger shows 'All statuses' when value is undefined", () => {
    render(<CalendarStatusFilter value={undefined} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("All statuses");
  });

  it("trigger shows 'Not done' when value is pending", () => {
    render(<CalendarStatusFilter value="pending" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("Not done");
  });

  it("trigger shows 'Overdue' when value is overdue", () => {
    render(<CalendarStatusFilter value="overdue" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("Overdue");
  });

  it("trigger shows 'Completed' when value is completed", () => {
    render(<CalendarStatusFilter value="completed" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /status filter/i }),
    ).toHaveTextContent("Completed");
  });

  it("opens popover and lists all 4 options on trigger click", async () => {
    const user = userEvent.setup();
    render(<CalendarStatusFilter value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    expect(screen.getAllByText("All statuses")).toHaveLength(2); // trigger + popover
    expect(screen.getAllByText("Not done")).toHaveLength(1);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("calls onChange(undefined) when 'All statuses' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value="pending" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    const allButtons = screen.getAllByText("All statuses");
    await user.click(allButtons[allButtons.length - 1]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("calls onChange('pending') when 'Not done' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByText("Not done"));
    expect(onChange).toHaveBeenCalledWith("pending");
  });

  it("calls onChange('overdue') when 'Overdue' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByText("Overdue"));
    expect(onChange).toHaveBeenCalledWith("overdue");
  });

  it("calls onChange('completed') when 'Completed' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarStatusFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByText("Completed"));
    expect(onChange).toHaveBeenCalledWith("completed");
  });

  it("shows checkmark next to active option", async () => {
    const user = userEvent.setup();
    render(<CalendarStatusFilter value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /status filter/i }));
    const allStatusesRow = screen
      .getAllByText("All statuses")[1]
      .closest("button");
    expect(allStatusesRow).toHaveClass("bg-accent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test --run src/components/calendar/CalendarStatusFilter.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `CalendarStatusFilter` not found.

- [ ] **Step 3: Implement `CalendarStatusFilter.tsx`**

Create `src/components/calendar/CalendarStatusFilter.tsx`:

```tsx
import { Check, CheckCircle2, Circle, Clock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CalendarStatusFilterValue =
  | "completed"
  | "overdue"
  | "pending"
  | undefined;

interface CalendarStatusFilterProps {
  readonly value: CalendarStatusFilterValue;
  readonly onChange: (value: CalendarStatusFilterValue) => void;
}

const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    color: "#94a3b8",
    borderColor: "rgba(148,163,184,0.4)",
    background: "rgba(148,163,184,0.08)",
  },
  overdue: {
    icon: Clock,
    color: "#f97316",
    borderColor: "rgba(249,115,22,0.4)",
    background: "rgba(249,115,22,0.08)",
  },
  completed: {
    icon: CheckCircle2,
    color: "#22c55e",
    borderColor: "rgba(34,197,94,0.4)",
    background: "rgba(34,197,94,0.08)",
  },
} as const;

export function CalendarStatusFilter({
  value,
  onChange,
}: CalendarStatusFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const config = value ? STATUS_CONFIG[value] : undefined;
  const Icon = config?.icon;

  const triggerStyle = config
    ? {
        borderColor: config.borderColor,
        background: config.background,
        color: config.color,
      }
    : undefined;

  const options: Array<{ value: CalendarStatusFilterValue; label: string }> = [
    { value: undefined, label: t("calendar.filter.allStatuses") },
    { value: "pending", label: t("calendar.filter.pending") },
    { value: "overdue", label: t("calendar.filter.overdue") },
    { value: "completed", label: t("calendar.filter.completed") },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("calendar.filter.statusTrigger")}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1.5 h-7 px-2.5 text-xs border max-w-[10rem]",
          value === undefined && "border-border/40 text-muted-foreground",
        )}
        style={triggerStyle}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate min-w-0">
          {value === undefined
            ? t("calendar.filter.allStatuses")
            : t(`calendar.filter.${value}`)}
        </span>
        <span className="opacity-40 text-[10px]">▾</span>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="end">
        <div className="space-y-0.5">
          {options.map((opt) => {
            const selected = value === opt.value;
            const OptIcon = opt.value ? STATUS_CONFIG[opt.value].icon : null;
            return (
              <button
                type="button"
                key={String(opt.value)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                  selected && "bg-accent",
                )}
              >
                {OptIcon ? (
                  <OptIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="flex-1 text-left truncate">{opt.label}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test --run src/components/calendar/CalendarStatusFilter.test.tsx 2>&1 | tail -20
```

Expected: all 9 tests PASS.

---

### Task 3: Wire up state and filtering in `CalendarView`

**Files:**

- Modify: `src/components/calendar/CalendarView.tsx`

- [ ] **Step 1: Add status filter state**

In `CalendarView.tsx`, after the existing `calendarProjectFilter` state (line 27), add:

```tsx
const [calendarStatusFilter, setCalendarStatusFilter] = useState<
  "completed" | "overdue" | "pending" | undefined
>(undefined);
```

Also add the import at the top if not already present (it won't be — `useState` is already imported).

- [ ] **Step 2: Replace the `filteredTasks` memo**

Replace the existing `filteredTasks` useMemo (lines 42–48) with:

```tsx
const filteredTasks = useMemo(() => {
  let result =
    calendarProjectFilter === undefined
      ? tasks
      : tasks.filter((t) => t.projectId === calendarProjectFilter);

  if (calendarStatusFilter !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    result = result.filter((t) => {
      if (calendarStatusFilter === "completed") return t.completedAt !== null;
      if (calendarStatusFilter === "overdue")
        return (
          t.completedAt === null && t.dueDate !== null && t.dueDate < today
        );
      return (
        t.completedAt === null && (t.dueDate === null || t.dueDate >= today)
      );
    });
  }
  return result;
}, [tasks, calendarProjectFilter, calendarStatusFilter]);
```

- [ ] **Step 3: Pass new props to `CalendarHeader`**

In the `<CalendarHeader>` JSX (around line 111), add the two new props:

```tsx
<CalendarHeader
  currentDate={currentDate}
  viewMode={viewMode}
  onViewModeChange={(mode) => {
    setViewMode(mode);
    setSelectedDay(null);
  }}
  onPrev={handlePrev}
  onNext={handleNext}
  onDateChange={handleDateChange}
  projectFilter={calendarProjectFilter}
  onProjectFilterChange={setCalendarProjectFilter}
  statusFilter={calendarStatusFilter}
  onStatusFilterChange={setCalendarStatusFilter}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: errors about `CalendarHeader` missing props — that's fine, it will be fixed in the next task. If there are other errors, fix them before proceeding.

---

### Task 4: Wire up `CalendarHeader`

**Files:**

- Modify: `src/components/calendar/CalendarHeader.tsx`

- [ ] **Step 1: Add import and props**

At the top of `CalendarHeader.tsx`, add the import:

```tsx
import { CalendarStatusFilter } from "./CalendarStatusFilter";
import type { CalendarStatusFilterValue } from "./CalendarStatusFilter";
```

Extend `CalendarHeaderProps`:

```ts
interface CalendarHeaderProps {
  readonly currentDate: Date;
  readonly viewMode: CalendarViewMode;
  readonly onViewModeChange: (mode: CalendarViewMode) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onDateChange: (date: Date) => void;
  readonly projectFilter: string | null | undefined;
  readonly onProjectFilterChange: (value: string | null | undefined) => void;
  readonly statusFilter: CalendarStatusFilterValue;
  readonly onStatusFilterChange: (value: CalendarStatusFilterValue) => void;
}
```

Add the two new params to the destructured function signature:

```tsx
export function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onDateChange,
  projectFilter,
  onProjectFilterChange,
  statusFilter,
  onStatusFilterChange,
}: CalendarHeaderProps) {
```

- [ ] **Step 2: Render `CalendarStatusFilter` next to `CalendarProjectFilter`**

Find the right-side `flex` div (the one containing `<CalendarProjectFilter>`). Add `<CalendarStatusFilter>` immediately before it:

```tsx
<div className="flex items-center gap-2">
  <CalendarStatusFilter value={statusFilter} onChange={onStatusFilterChange} />
  <CalendarProjectFilter
    value={projectFilter}
    onChange={onProjectFilterChange}
  />
  {/* ... rest of the buttons unchanged ... */}
</div>
```

- [ ] **Step 3: Verify full build passes**

```bash
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run all calendar tests**

```bash
pnpm test --run src/components/calendar/ 2>&1 | tail -30
```

Expected: all tests pass.
