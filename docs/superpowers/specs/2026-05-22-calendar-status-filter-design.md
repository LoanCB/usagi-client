# Calendar Status Filter — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

## Overview

Add a single-select task state filter to the calendar header, placed next to the existing project filter. The filter lets the user restrict the calendar to tasks in one of three states: pending, overdue, or completed.

## Filter States

State is derived from existing `Task` fields (`completedAt`, `dueDate`) — no schema changes needed.

| Value         | Label          | Condition                                                             |
| ------------- | -------------- | --------------------------------------------------------------------- |
| `undefined`   | Tous les états | No filter (default)                                                   |
| `"pending"`   | Non faite      | `completedAt === null` AND (`dueDate === null` OR `dueDate >= today`) |
| `"overdue"`   | En retard      | `completedAt === null` AND `dueDate !== null` AND `dueDate < today`   |
| `"completed"` | Terminée       | `completedAt !== null`                                                |

The two filters (project + status) are independent and cumulative: both are applied in sequence in the `filteredTasks` memo.

## Architecture

### New file: `CalendarStatusFilter.tsx`

Structural mirror of `CalendarProjectFilter.tsx`. A `Popover`-based button that:

- Shows "Tous les états" when no filter is active (`value === undefined`)
- Shows the selected state label + icon when active
- Trigger button uses semantic color when active: orange for overdue, green for completed, slate for pending
- Options list: 4 items (all + 3 states), each with a lucide icon and a checkmark when selected

**Props:**

```ts
interface CalendarStatusFilterProps {
  value: "completed" | "overdue" | "pending" | undefined;
  onChange: (value: "completed" | "overdue" | "pending" | undefined) => void;
}
```

**Icons (lucide-react):**

- pending → `Circle`
- overdue → `Clock`
- completed → `CheckCircle2`

### Modified: `CalendarView.tsx`

Add state:

```ts
const [calendarStatusFilter, setCalendarStatusFilter] = useState<
  "completed" | "overdue" | "pending" | undefined
>(undefined);
```

Extend `filteredTasks` memo to chain the status filter after the project filter:

```ts
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
      // "pending"
      return (
        t.completedAt === null && (t.dueDate === null || t.dueDate >= today)
      );
    });
  }
  return result;
}, [tasks, calendarProjectFilter, calendarStatusFilter]);
```

Pass `statusFilter` and `onStatusFilterChange` to `CalendarHeader`.

### Modified: `CalendarHeader.tsx`

Add two props:

```ts
statusFilter: "completed" | "overdue" | "pending" | undefined;
onStatusFilterChange: (value: "completed" | "overdue" | "pending" | undefined) => void;
```

Render `<CalendarStatusFilter>` immediately to the left of `<CalendarProjectFilter>` in the right-side `flex` container.

### Modified: i18n (`fr.ts` and `en.ts`)

Add under `calendar.filter`:

```ts
// fr.ts
allStatuses: "Tous les états",
statusTrigger: "Filtre état",
pending: "Non faite",
overdue: "En retard",
completed: "Terminée",

// en.ts
allStatuses: "All statuses",
statusTrigger: "Status filter",
pending: "Not done",
overdue: "Overdue",
completed: "Completed",
```

## Files to Create / Modify

| Action | File                                               |
| ------ | -------------------------------------------------- |
| Create | `src/components/calendar/CalendarStatusFilter.tsx` |
| Modify | `src/components/calendar/CalendarView.tsx`         |
| Modify | `src/components/calendar/CalendarHeader.tsx`       |
| Modify | `src/i18n/locales/fr.ts`                           |
| Modify | `src/i18n/locales/en.ts`                           |

## Out of Scope

- Persisting the status filter across sessions (same behavior as the project filter)
- Multi-select status filtering
- Applying the status filter to `DayDetailPanel` (it already shows tasks by date, states are visually distinct there)
