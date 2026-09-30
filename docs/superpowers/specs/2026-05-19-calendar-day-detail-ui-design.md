# Calendar Day Detail Panel — UI Improvements

**Date:** 2026-05-19  
**Status:** Approved  
**File:** `src/components/calendar/DayDetailPanel.tsx`

## Problem

Three readability/UX issues identified in the current `DayDetailPanel`:

1. **Completed tasks** use `text-green-400 line-through opacity-70` — green strikethrough text is very hard to read.
2. **No distinction between overdue and future** — all `due` tasks use the same orange styling regardless of whether the day is in the past or future.
3. **Insufficient spacing** — `gap-1` between items makes the panel feel dense and hard to scan.

## Design

### Task states

The panel receives a `day: string` (e.g. `"2025-05-15"`) and `entry: { due: Task[], completed: Task[] }`. The `due` array contains tasks not yet completed for that day.

The state of `due` tasks is determined by comparing the panel's `day` to today's date:

| State         | Condition        | Visual treatment                                                                                  |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| **Overdue**   | `day < today`    | Red background (`red-500/12`), left border (`red-500/50`), "retard" / "overdue" badge             |
| **Today**     | `day === today`  | Orange background (`orange-500/14`), small orange dot                                             |
| **Future**    | `day > today`    | Light orange background (`orange-500/10`), no decoration                                          |
| **Completed** | in `completed[]` | Transparent background, muted gray text (`#475569`), circular ✓ icon — no strikethrough, no green |

### Section separators

Two labeled dividers replace the current unseparated list:

- **"À faire" / "To do"** — shown above `due` tasks (hidden if empty)
- **"Terminées" / "Completed"** — shown above `completed` tasks (hidden if empty)

Each separator is a small uppercase label with a horizontal rule extending to the right.

### Spacing

Increase container `gap-1` → `gap-2`. Individual items keep `py-1.5` (already adequate with `gap-2`). The section divider has `pt-2` top padding to breathe from the previous section.

### Multi-project groups

The same state logic (overdue/today/future/completed) applies to each per-project group — no change to the grouping structure.

## i18n keys to add

In `src/i18n/locales/fr.ts` and `en.ts`, under the `calendar` namespace:

```ts
// fr.ts
dueSection: "À faire",
completedSection: "Terminées",
overdue: "retard",

// en.ts
dueSection: "To do",
completedSection: "Completed",
overdue: "overdue",
```

## Files to modify

| File                                         | Change                                                     |
| -------------------------------------------- | ---------------------------------------------------------- |
| `src/components/calendar/DayDetailPanel.tsx` | Apply new task styles, section dividers, overdue detection |
| `src/i18n/locales/fr.ts`                     | Add `dueSection`, `completedSection`, `overdue` keys       |
| `src/i18n/locales/en.ts`                     | Add `dueSection`, `completedSection`, `overdue` keys       |

## Out of scope

- No changes to task data model or calendar data fetching
- No changes to multi-project grouping logic
- No changes to `QuickAddTask` at the bottom
