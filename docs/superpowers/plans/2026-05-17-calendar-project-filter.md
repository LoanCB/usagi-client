# Calendar Project Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent project filter to the calendar view header that restricts which tasks are shown in the calendar.

**Architecture:** A new `CalendarProjectFilter` component (Popover-based, styled like existing `ProjectSelector`) is added to `CalendarHeader` before the Month/Week toggle. State (`undefined | null | string`) lives in `CalendarView` and tasks are filtered in-memory before `groupTasksByDate()`.

**Tech Stack:** React, TypeScript, Zustand (`useProjectStore`), shadcn Popover, react-i18next, Vitest + React Testing Library.

---

### Task 1: Add i18n keys and create `CalendarProjectFilter`

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`
- Create: `src/components/calendar/CalendarProjectFilter.tsx`
- Create: `src/components/calendar/CalendarProjectFilter.test.tsx`

- [ ] **Step 1: Add i18n keys in `en.ts`**

In `src/i18n/locales/en.ts`, inside the `calendar:` object, add a `filter` sub-object:

```ts
// Before (existing keys):
calendar: {
  month: "Month",
  week: "Week",
  noTasks: "No tasks for this day",
  newTask: "New task for this day",
  closeDay: "Close day detail",
},

// After:
calendar: {
  month: "Month",
  week: "Week",
  noTasks: "No tasks for this day",
  newTask: "New task for this day",
  closeDay: "Close day detail",
  filter: {
    allProjects: "All projects",
    trigger: "Project filter",
  },
},
```

- [ ] **Step 2: Add i18n keys in `fr.ts`**

In `src/i18n/locales/fr.ts`, inside the `calendar:` object, add the same `filter` sub-object:

```ts
// Before (existing keys):
calendar: {
  month: "Mois",
  week: "Semaine",
  noTasks: "Aucune tâche pour ce jour",
  newTask: "Nouvelle tâche pour ce jour",
  closeDay: "Fermer le détail du jour",
},

// After:
calendar: {
  month: "Mois",
  week: "Semaine",
  noTasks: "Aucune tâche pour ce jour",
  newTask: "Nouvelle tâche pour ce jour",
  closeDay: "Fermer le détail du jour",
  filter: {
    allProjects: "Tous les projets",
    trigger: "Filtre projet",
  },
},
```

- [ ] **Step 3: Write the failing tests**

Create `src/components/calendar/CalendarProjectFilter.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { CalendarProjectFilter } from "@/components/calendar/CalendarProjectFilter";
import { useProjectStore } from "@/store/projects";

const mockProjects = [
  { id: "p1", name: "Dev", color: "#6ee7b7", icon: "folder", sortOrder: 0 },
  { id: "p2", name: "Perso", color: "#60a5fa", icon: "star", sortOrder: 1 },
];

beforeEach(() => {
  useProjectStore.setState({
    projects: mockProjects,
    loadProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  });
});

describe("CalendarProjectFilter", () => {
  it("trigger shows 'All projects' when value is undefined", () => {
    render(<CalendarProjectFilter value={undefined} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /project filter/i }),
    ).toHaveTextContent("All projects");
  });

  it("trigger shows 'Inbox' when value is null", () => {
    render(<CalendarProjectFilter value={null} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /project filter/i }),
    ).toHaveTextContent("Inbox");
  });

  it("trigger shows project name when a project is selected", () => {
    render(<CalendarProjectFilter value="p1" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /project filter/i }),
    ).toHaveTextContent("Dev");
  });

  it("opens popover and lists all options on trigger click", async () => {
    const user = userEvent.setup();
    render(<CalendarProjectFilter value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /project filter/i }));
    expect(screen.getAllByText("All projects")).toHaveLength(2); // trigger + popover
    expect(screen.getAllByText("Inbox")).toHaveLength(1);
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByText("Perso")).toBeInTheDocument();
  });

  it("calls onChange(undefined) when 'All projects' is clicked in popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarProjectFilter value="p1" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /project filter/i }));
    const allProjectsButtons = screen.getAllByText("All projects");
    await user.click(allProjectsButtons[allProjectsButtons.length - 1]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("calls onChange(null) when Inbox is clicked in popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarProjectFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /project filter/i }));
    await user.click(screen.getByText("Inbox"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with project id when a project is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarProjectFilter value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /project filter/i }));
    await user.click(screen.getByText("Dev"));
    expect(onChange).toHaveBeenCalledWith("p1");
  });

  it("shows checkmark next to active option", async () => {
    const user = userEvent.setup();
    render(<CalendarProjectFilter value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /project filter/i }));
    const allProjectsRow = screen
      .getAllByText("All projects")[1]
      .closest("button");
    expect(allProjectsRow).toHaveClass("bg-accent");
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
pnpm test -- CalendarProjectFilter --run
```

Expected: FAIL — `CalendarProjectFilter` not found.

- [ ] **Step 5: Create `CalendarProjectFilter.tsx`**

Create `src/components/calendar/CalendarProjectFilter.tsx`:

```tsx
import { Check, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import type { Project } from "@/types";

interface CalendarProjectFilterProps {
  readonly value: string | null | undefined;
  readonly onChange: (value: string | null | undefined) => void;
}

function ProjectIcon({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  const iconDef =
    PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
  const Icon = iconDef.icon;
  return (
    <Icon className={className} style={{ color: project.color ?? undefined }} />
  );
}

export function CalendarProjectFilter({
  value,
  onChange,
}: CalendarProjectFilterProps) {
  const { t } = useTranslation();
  const { projects } = useProjectStore();

  const selectedProject =
    typeof value === "string"
      ? (projects.find((p) => p.id === value) ?? null)
      : null;

  const triggerStyle =
    value === null
      ? {
          borderColor: "rgba(148,163,184,0.4)",
          background: "rgba(148,163,184,0.08)",
          color: "#94a3b8",
        }
      : selectedProject
        ? {
            borderColor: `${selectedProject.color}66`,
            background: `${selectedProject.color}18`,
            color: selectedProject.color ?? undefined,
          }
        : undefined;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("calendar.filter.trigger")}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1.5 h-7 px-2.5 text-xs border",
          value === undefined && "border-border/40 text-muted-foreground",
        )}
        style={triggerStyle}
      >
        {value === undefined && <span>{t("calendar.filter.allProjects")}</span>}
        {value === null && (
          <>
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span>{t("nav.inbox")}</span>
          </>
        )}
        {selectedProject && (
          <>
            <span
              className="h-[7px] w-[7px] rounded-full shrink-0"
              style={{ background: selectedProject.color ?? "#94a3b8" }}
            />
            <span>{selectedProject.name}</span>
          </>
        )}
        <span className="opacity-40 text-[10px]">▾</span>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="end">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
              value === undefined && "bg-accent",
            )}
          >
            <span className="flex-1 text-left truncate">
              {t("calendar.filter.allProjects")}
            </span>
            {value === undefined && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
              value === null && "bg-accent",
            )}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left truncate">{t("nav.inbox")}</span>
            {value === null && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
          {projects.length > 0 && <div className="my-1 h-px bg-border/40" />}
          {projects.map((project) => {
            const selected = value === project.id;
            return (
              <button
                type="button"
                key={project.id}
                onClick={() => onChange(project.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                  selected && "bg-accent",
                )}
              >
                <ProjectIcon
                  project={project}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="flex-1 text-left truncate">
                  {project.name}
                </span>
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

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm test -- CalendarProjectFilter --run
```

Expected: all 7 tests PASS.

---

### Task 2: Update `CalendarHeader` to render the filter

**Files:**

- Modify: `src/components/calendar/CalendarHeader.tsx`

- [ ] **Step 1: Add new props to `CalendarHeaderProps` interface**

In `src/components/calendar/CalendarHeader.tsx`, update the interface (lines 17–24):

```ts
// Before:
interface CalendarHeaderProps {
  readonly currentDate: Date;
  readonly viewMode: CalendarViewMode;
  readonly onViewModeChange: (mode: CalendarViewMode) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onDateChange: (date: Date) => void;
}

// After:
interface CalendarHeaderProps {
  readonly currentDate: Date;
  readonly viewMode: CalendarViewMode;
  readonly onViewModeChange: (mode: CalendarViewMode) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onDateChange: (date: Date) => void;
  readonly projectFilter: string | null | undefined;
  readonly onProjectFilterChange: (value: string | null | undefined) => void;
}
```

- [ ] **Step 2: Destructure new props and import `CalendarProjectFilter`**

At the top of `CalendarHeader.tsx`, add the import after the existing local imports:

```ts
import { CalendarProjectFilter } from "./CalendarProjectFilter";
```

In the function signature, destructure the new props:

```ts
// Before:
export function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onDateChange,
}: CalendarHeaderProps) {

// After:
export function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onDateChange,
  projectFilter,
  onProjectFilterChange,
}: CalendarHeaderProps) {
```

- [ ] **Step 3: Render `CalendarProjectFilter` before the Month/Week toggle**

In the JSX, the right-side `div` (line 76) currently looks like:

```tsx
<div className="flex items-center gap-2">
  <div className="flex rounded-lg overflow-hidden border border-border/40">
    ...Month/Week toggle...
  </div>
  <Button ...>
```

Update it to add `CalendarProjectFilter` first:

```tsx
<div className="flex items-center gap-2">
  <CalendarProjectFilter
    value={projectFilter}
    onChange={onProjectFilterChange}
  />
  <div className="flex rounded-lg overflow-hidden border border-border/40">
    <button
      type="button"
      onClick={() => onViewModeChange("month")}
      className={cn(
        "px-3 py-1 text-sm transition-colors",
        viewMode === "month"
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
      )}
    >
      {t("calendar.month")}
    </button>
    <button
      type="button"
      onClick={() => onViewModeChange("week")}
      className={cn(
        "px-3 py-1 text-sm transition-colors",
        viewMode === "week"
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
      )}
    >
      {t("calendar.week")}
    </button>
  </div>
  <Button variant="ghost" size="icon" onClick={onPrev} className="h-8 w-8">
    <ChevronLeft className="h-4 w-4" />
  </Button>
  <Button variant="ghost" size="icon" onClick={onNext} className="h-8 w-8">
    <ChevronRight className="h-4 w-4" />
  </Button>
</div>
```

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
pnpm test --run
```

Expected: all existing tests PASS. Note: TypeScript will show a type error in `CalendarView.tsx` (missing required `projectFilter` + `onProjectFilterChange` props) until Task 3 is complete — this is expected and won't affect vitest since it uses esbuild, not tsc.

---

### Task 3: Add filter state and filtering logic in `CalendarView`

**Files:**

- Modify: `src/components/calendar/CalendarView.tsx`

- [ ] **Step 1: Add `calendarProjectFilter` state**

In `src/components/calendar/CalendarView.tsx`, after the existing state declarations (line 19), add:

```ts
const [calendarProjectFilter, setCalendarProjectFilter] = useState<
  string | null | undefined
>(undefined);
```

- [ ] **Step 2: Filter tasks before `groupTasksByDate`**

Replace the existing `grouped` memo (line 36):

```ts
// Before:
const grouped = useMemo(() => groupTasksByDate(tasks), [tasks]);

// After:
const filteredTasks = useMemo(
  () =>
    calendarProjectFilter === undefined
      ? tasks
      : tasks.filter((t) => t.projectId === calendarProjectFilter),
  [tasks, calendarProjectFilter],
);

const grouped = useMemo(() => groupTasksByDate(filteredTasks), [filteredTasks]);
```

- [ ] **Step 3: Pass filter props to `CalendarHeader`**

In the JSX, update the `<CalendarHeader>` call (lines 72–82):

```tsx
// Before:
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
/>

// After:
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
/>
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm test --run
```

Expected: all tests PASS, no TypeScript errors.

- [ ] **Step 5: Verify in the running app**

```bash
pnpm dev
```

Open the calendar view. Confirm:

1. The "All projects" dropdown appears before the Month/Week toggle.
2. Selecting a project hides tasks from other projects in both month and week views.
3. Selecting "Inbox" shows only tasks with no project.
4. Selecting "All projects" restores all tasks.
5. The button changes color (project color / slate for inbox / muted for all).
6. Navigating months/weeks preserves the active filter.
