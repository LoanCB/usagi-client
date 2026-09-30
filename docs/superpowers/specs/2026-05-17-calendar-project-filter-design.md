# Calendar Project Filter — Design Spec

**Date:** 2026-05-17
**Status:** Approved

## Overview

Add a project filter to the calendar view header. The filter is independent from the global project selection used elsewhere in the app. It lets the user restrict which tasks are visible in the calendar by project.

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Placement | Inline right group, before Month/Week toggle | Option B — keeps controls grouped, clean |
| Component | New `CalendarProjectFilter` | Separation of concerns, no regression risk on existing `ProjectSelector` |
| State location | Local to `CalendarView` | Independent from global UI store |
| Default state | `undefined` (show all) | Neutral starting point |
| Options | Tous / Boîte de réception / Projects | Covers all task.projectId values |
| Appearance | Colored when active | Discret by default, project color when a project is selected, slate when Inbox |

## Components

### New: `CalendarProjectFilter`

**File:** `src/components/calendar/CalendarProjectFilter.tsx`

**Props:**
```ts
interface CalendarProjectFilterProps {
  value: string | null | undefined;  // undefined=all, null=inbox, string=projectId
  onChange: (value: string | null | undefined) => void;
}
```

**Behavior:**
- Renders a Popover trigger button
- Trigger shows: "Tous les projets" (muted) when `undefined`; 📥 + "Boîte de réception" (slate tint) when `null`; project dot + project name (project color tint) when a project is selected
- Popover content lists: "Tous les projets" first, then "Boîte de réception", then a separator, then all projects with their icon and color
- Active item shows a checkmark
- Clicking "Tous les projets" calls `onChange(undefined)`
- Clicking "Boîte de réception" calls `onChange(null)`
- Clicking a project calls `onChange(project.id)`
- Uses shadcn `Popover` / `PopoverTrigger` / `PopoverContent`
- Reads projects from `useProjectStore()`

**Visual states:**
- Default (`undefined`): `border border-border/40 text-muted-foreground bg-transparent`
- Inbox (`null`): `border-slate-400/40 bg-slate-400/10 text-slate-400`
- Project (`string`): border and background tinted with `project.color` via inline style; text in `project.color`

**Trigger icon choice:** The trigger button uses a **colored dot** (7×7px circle, `project.color`) — not the project's icon — for compactness. The popover list items use the full project icon (same as `ProjectSelector`). Color values are CSS strings stored in `project.color`, applied via inline `style` prop (not Tailwind utilities).

### Modified: `CalendarHeader`

**File:** `src/components/calendar/CalendarHeader.tsx`

**New props:**
```ts
projectFilter: string | null | undefined;
onProjectFilterChange: (value: string | null | undefined) => void;
```

**Change:** Add `<CalendarProjectFilter>` in the right `div`, before the Month/Week toggle.

### Modified: `CalendarView`

**File:** `src/components/calendar/CalendarView.tsx`

**New state:**
```ts
const [calendarProjectFilter, setCalendarProjectFilter] = useState<string | null | undefined>(undefined);
```

**Filtering logic** (applied before `groupTasksByDate()`):
```ts
const filteredTasks = calendarProjectFilter === undefined
  ? tasks
  : tasks.filter((t) => t.projectId === calendarProjectFilter);

const tasksByDate = groupTasksByDate(filteredTasks);
```

**Pass to `CalendarHeader`:**
```tsx
<CalendarHeader
  ...existing props...
  projectFilter={calendarProjectFilter}
  onProjectFilterChange={setCalendarProjectFilter}
/>
```

## Data Flow

```
CalendarView
  └─ calendarProjectFilter state (undefined | null | string)
       │
       ├─► CalendarHeader → CalendarProjectFilter (display + interaction)
       │        └─ onProjectFilterChange → setCalendarProjectFilter
       │
       └─► filter tasks[] before groupTasksByDate()
                └─► tasksByDate → MonthView / WeekView / DayDetailPanel
```

## Type Values

| Value | Meaning | Tasks shown |
|---|---|---|
| `undefined` | Tous les projets | All tasks |
| `null` | Boîte de réception | Tasks where `projectId === null` |
| `"abc123"` | A specific project | Tasks where `projectId === "abc123"` |

## Out of Scope

- Persisting the filter across sessions (no localStorage)
- Multi-project selection
- Syncing with the global `selectedProjectId` in UIStore
- Filtering in `DayDetailPanel` independently (it consumes the already-filtered `tasksByDate`)
