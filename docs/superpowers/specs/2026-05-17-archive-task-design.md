# Archive Task (Soft Delete) — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

## Context

The SQLite layer already has a `deleted_at` column and the current `deleteTask` implementation is already a soft delete (`UPDATE SET deleted_at`). However, the `Task` TypeScript type does not expose `deleted_at`, there is no hard delete, and there is no archive view.

## Goal

Add a distinct "Archive" action (soft delete, recoverable) accessible everywhere "Delete" is, alongside a true hard delete. Archived tasks are visible in a dedicated sidebar view with unarchive and permanent delete options.

## Architecture

### Data Layer

**`Task` interface** (`src/types/index.ts`)  
Add `deletedAt: string | null` to the existing `Task` interface.

**Repository interface** (`src/db/repository.ts`)  
Replace `deleteTask` signature with:

- `archiveTask(id: string): Promise<void>` — soft delete (sets `deleted_at`)
- `deleteTask(id: string): Promise<void>` — hard delete (`DELETE FROM tasks`)
- `unarchiveTask(id: string): Promise<void>` — sets `deleted_at = NULL`
- `getArchivedTasks(): Promise<Task[]>` — fetches tasks where `deleted_at IS NOT NULL`, ordered by `deleted_at DESC`

**SQLite repository** (`src/db/sqlite-repository.ts`)

- `archiveTask` → current `deleteTask` implementation (already correct: `UPDATE SET deleted_at`)
- `deleteTask` → new: `DELETE FROM tasks WHERE id = ?`
- `unarchiveTask` → `UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?`
- `getArchivedTasks` → `SELECT ... FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC` + tag join

### Store

**`src/store/tasks.ts`**

- Rename `deleteTask` action → `archiveTask`
- Add `deleteTask` action → calls `repo.deleteTask`, removes task from state
- Add `unarchiveTask` action → calls `repo.unarchiveTask`, removes task from `archivedTasks`
- Add `loadArchivedTasks` action → calls `repo.getArchivedTasks`, sets `archivedTasks`
- Add `archivedTasks: Task[]` to state (separate from active `tasks[]`)

### UI

**`src/components/tasks/TaskItem.tsx`** — context menu  
Add "Archiver" item (icon: `Archive`) above "Supprimer". "Supprimer" now calls `deleteTask` (hard delete).

**`src/components/layout/TaskDetail.tsx`** — bottom action area  
Add "Archiver" button (icon: `Archive`) next to "Supprimer". "Supprimer" now calls `deleteTask` (hard delete).

**`src/components/layout/ArchiveView.tsx`** — new component

- Calls `loadArchivedTasks` on mount
- Renders list of archived `Task` items
- Each task shows: title, project, `deletedAt` date, "Restaurer" button (unarchive), "Supprimer" button (hard delete)
- Empty state when no archived tasks

**`src/components/layout/Sidebar.tsx`**  
Add a fixed "Archives" navigation entry (icon: `Archive`) alongside existing views ("Aujourd'hui", "Toutes les tâches", etc.).

**`src/store/ui.ts`**  
Add `"archives"` as a sentinel value for `selectedProjectId` (same pattern as `"today"`, `"calendar"`, `"tags"`). Selecting "Archives" in the sidebar sets `selectedProjectId = "archives"` and the main layout renders `ArchiveView`.

## Behaviour Details

- "Archiver" is only relevant for **non-completed** tasks (completed tasks are already handled via `completedAt`). The action is still available on completed tasks if the user triggers it, but the primary intent is for non-completed ones.
- "Supprimer" in context menus / TaskDetail now performs a **hard, irreversible delete**. No confirmation dialog is required (consistent with current UX), but the destructive style should be visually clear.
- Archived tasks are excluded from all standard task views (`WHERE deleted_at IS NULL` already in place).
- `unarchiveTask` restores the task to its original project/inbox without changing other fields.

## Files to Create

- `src/components/layout/ArchiveView.tsx`

## Files to Modify

- `src/types/index.ts` — add `deletedAt`
- `src/db/repository.ts` — update interface
- `src/db/sqlite-repository.ts` — implement new methods
- `src/store/tasks.ts` — rename + add actions
- `src/components/tasks/TaskItem.tsx` — add Archive item to context menu
- `src/components/layout/TaskDetail.tsx` — add Archive button
- `src/components/layout/Sidebar.tsx` — add Archives nav entry
- `src/store/ui.ts` (or equivalent) — add `"archives"` view

## Out of Scope

- Bulk archive / bulk delete
- Archive search / filtering
- Auto-archive after N days
- Keyboard shortcut for archive
