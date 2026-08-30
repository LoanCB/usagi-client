# Quick Add Task — Tag Selector

**Date:** 2026-04-23
**Status:** Approved

## Summary

Add the ability to assign tags when creating a task via the quick-add bar at the bottom of the task list.

## Current State

`QuickAddTask` renders a sticky bottom bar with only a text input. Pressing Enter creates the task with just a title and projectId. Tags are only assignable via the full `TaskForm` dialog.

## Design

Add `TagSelector` to the right of the input inside `QuickAddTask`. Selected tag badges appear inline in the trigger button (same behaviour as in `TaskForm`). Tags are passed to `createTask` on submission and reset alongside the title field.

**Layout:**
```
[□] [input flex-1]  [🏷 badge1 badge2]
```

## Changes

**`src/components/tasks/QuickAddTask.tsx`** — only file modified:
- Add `tagIds` state (`useState<string[]>([])`)
- Reset `tagIds` to `[]` after successful task creation
- Pass `tagIds` to `createTask` input
- Render `<TagSelector selectedTagIds={tagIds} onChange={setTagIds} />` to the right of the input

No new files. No changes to the store, types, or repository layer — `CreateTaskInput.tagIds` already exists.
