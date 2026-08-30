# Calendar Day Detail — Tasks Grouped by Project

**Date:** 2026-05-17  
**Status:** Approved

## Summary

In the calendar day detail panel (`DayDetailPanel`), tasks are currently displayed as two flat lists (due / completed). When tasks span multiple projects, this makes it hard to see what belongs where. This feature groups tasks by project, with Inbox at the bottom.

## Behaviour

- If all tasks belong to a single project (or there are no tasks), no project headers are shown — existing layout is preserved.
- If tasks span multiple projects, each project gets its own group containing its due tasks (orange) then completed tasks (green, strikethrough).
- Project groups are ordered by `sortOrder` from the project store.
- The Inbox group (`projectId: null`) always appears last.

## Data Flow

1. `CalendarView` reads `projects` from `useProjectStore`.
2. `CalendarView` passes `projects` as a new prop to `DayDetailPanel`.
3. Inside `DayDetailPanel`, a derived structure is computed:
   - Collect distinct `projectId` values from `entry.due` and `entry.completed`.
   - If only one distinct projectId (or zero tasks) → render current flat layout, no headers.
   - Otherwise → build `Map<string | null, { due: Task[], completed: Task[] }>`, iterate in project `sortOrder` order, Inbox (`null`) last.

## Visual Structure (multi-project case)

```
┌─────────────────────────────┐
│ ● Project A                 │  ← dot (project.color) + name, text-xs muted
│   [task due orange]         │
│   [task due orange]         │
│   [task completed green ~~] │
├─────────────────────────────┤  ← subtle divider
│ ● Project B                 │
│   [task due orange]         │
├─────────────────────────────┤
│   Inbox                     │  ← no dot, label "Inbox" translated
│   [task due orange]         │
└─────────────────────────────┘
```

Task items keep their existing styles unchanged.

## Files to Change

| File                                         | Change                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `src/components/calendar/DayDetailPanel.tsx` | Accept `projects: Project[]` prop; add grouping logic and project headers |
| `src/components/calendar/CalendarView.tsx`   | Read `useProjectStore`, pass `projects` to `DayDetailPanel`               |
| `src/i18n/locales/fr.ts` + `en.ts`           | No new keys needed — "Inbox" label already exists or uses existing key    |

## Out of Scope

- Collapsible project groups
- Sorting tasks within a project by anything other than existing order
- Changes to `WeekView` (separate concern)
