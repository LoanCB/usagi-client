# Project Groups — Design Spec

**Date:** 2026-06-18  
**Status:** Approved

## Overview

Add the ability to group projects in the sidebar. A group has a name and a color, contains one or more projects, and can be collapsed/expanded. Groups are created by dragging one project onto another. Projects can be freely reordered via drag & drop within and across groups.

---

## Data Model

### New table: `project_groups`

```typescript
interface ProjectGroup {
  id: string;
  name: string;
  color: string; // hex color chosen at creation
  sortOrder: number; // position in the sidebar among standalone projects and groups
  createdAt: string;
  updatedAt: string;
}
```

### Modified: `Project`

Add one nullable field:

```typescript
interface Project {
  // ... existing fields unchanged
  groupId: string | null; // null = standalone project
}
```

`sortOrder` on `Project` remains a single global ordering space shared between standalone projects and groups. Inside a group, projects are ordered by their own `sortOrder`.

### Database methods (new)

| Method                                             | Description                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `createProjectGroup(input)`                        | Insert a new group row                                             |
| `updateProjectGroup(id, patch)`                    | Update name or color                                               |
| `deleteProjectGroup(id)`                           | Delete group row                                                   |
| `reorderProjects(orderedIds)`                      | Bulk-update `sort_order` by index (same pattern as `reorderTasks`) |
| `assignProjectToGroup(projectId, groupId \| null)` | Set `group_id` on a project                                        |

These methods will be added to the `TodoRepository` interface and implemented in `sqlite-repository.ts`.

---

## State Management

### New store: `useProjectGroupStore` (Zustand)

```typescript
interface ProjectGroupStore {
  groups: ProjectGroup[];
  loadGroups(repo: TodoRepository): Promise<void>;
  createGroup(
    repo: TodoRepository,
    name: string,
    color: string,
    projectIds: string[],
  ): Promise<ProjectGroup>;
  updateGroup(
    repo: TodoRepository,
    id: string,
    patch: Partial<ProjectGroup>,
  ): Promise<void>;
  deleteGroup(repo: TodoRepository, id: string): Promise<void>;
}
```

### Extensions to `useProjectStore`

```typescript
reorderProjects(repo: TodoRepository, orderedIds: string[]): Promise<void>;
assignToGroup(repo: TodoRepository, projectId: string, groupId: string | null): Promise<void>;
```

### Auto-delete empty group

The auto-delete logic lives in `assignToGroup`: after moving a project out of a group, count remaining projects in that group. If 0, call `deleteGroup` automatically. This keeps the rule centralized in the store, not scattered across UI components.

### UI state

Collapsed/expanded state for groups is stored in `useUIStore` as a `Set<string>` of `collapsedGroupIds`. This is local UI preference — not persisted to DB. Groups start expanded by default.

---

## Default Colors

A palette of 8 predefined colors in `src/lib/group-colors.ts`. At creation time, the color with the fewest current usages among existing groups is pre-selected automatically.

---

## Sidebar Structure

The sidebar builds a flat list of `SidebarItem` before rendering:

```typescript
type SidebarItem =
  | { type: "group"; group: ProjectGroup; projects: Project[] }
  | { type: "project"; project: Project };
```

Items are sorted by global `sortOrder`. A group occupies one position; its child projects appear immediately below (when expanded).

---

## New Components

### `ProjectGroupNavItem`

Header row for a group in the sidebar.

- Color pip on the left
- Group name
- Collapse/expand chevron (toggles `collapsedGroupIds` in UI store)
- Context menu: Rename, Change color, Dissolve group (moves all projects out, deletes group)

### `CreateGroupDialog`

Modal that opens when a project is dropped onto a standalone project.

Props: `projectA: Project`, `projectB: Project`, `onConfirm`, `onCancel`

Content:

- Text field "Nom du groupe" — empty by default, auto-focused on open
- Color picker — 8 color swatches, auto-selected color pre-selected
- "Annuler" / "Créer" buttons — "Créer" disabled when name is empty

On confirm:

1. `createGroup(repo, name, color, [projectA.id, projectB.id])`
2. Both projects receive the new `groupId`
3. Their `sortOrder` values are updated to reflect drop order
4. Group appears in sidebar, expanded by default

On cancel: drop is cancelled, projects remain in place.

---

## Drag & Drop Behavior

Library: `@dnd-kit` (already used for tasks — reuse same patterns).

### Drop targets on each item

| Dragged item         | Dropped onto           | Result                                                |
| -------------------- | ---------------------- | ----------------------------------------------------- |
| Standalone project   | Standalone project     | Open `CreateGroupDialog`                              |
| Standalone project   | Group header           | Add project to group                                  |
| Standalone project   | Project inside a group | Add project to that group, insert at drop position    |
| Project inside group | Gap between items      | Reorder (same pattern as tasks)                       |
| Project inside group | Different group header | Move to that group                                    |
| Project inside group | Standalone project     | Open `CreateGroupDialog` with both                    |
| Project inside group | Gap outside any group  | Remove from group (auto-deletes group if last member) |

### Visual feedback during drag

- Dragged item shows a semi-transparent ghost
- Valid drop zones highlight on hover
- Dropping on a project (to create group) shows a "merge" indicator

---

## Future Considerations

- Group model is designed to be sync-ready: `id`, `createdAt`, `updatedAt` follow the same shape as `Project` for future API synchronization.
- No nested groups (max one level of depth).
