# Unit Test Coverage — Design Spec

**Date:** 2026-05-14  
**Scope:** Unit tests only (integration/e2e tests excluded from this spec)  
**Out of scope:** `useOverdueNotifications`, `useOrbParallax` (Tauri/browser API coupling)

---

## Context

The project uses Vitest with `@testing-library/react` and `happy-dom`. Tests are co-located with source files (e.g. `src/lib/overdue.test.ts`) except for a few UI components under `src/test/`.

Several modules have no tests, and two existing test files cover only a subset of their store's actions.

---

## Files to Create

### `src/lib/utils.test.ts`

Pure functions — no mocks needed except `navigator` for platform detection.

| Function        | Cases                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| `formatDate`    | Formats ISO date to short locale string (`"Apr 12"`); respects optional locale param         |
| `isOverdue`     | Past date → `true`; today → `false`; future date → `false`                                   |
| `todayIso`      | Returns string matching `YYYY-MM-DD` format                                                  |
| `isMac`         | Mock `navigator.userAgentData.platform = "macOS"` → `true`; `"Win32"` → `false`              |
| `modifierLabel` | Returns `"⌘"` on Mac, `"Ctrl+"` on non-Mac                                                   |
| `hasModifier`   | `metaKey=true` on Mac → `true`; `ctrlKey=true` on non-Mac → `true`; wrong modifier → `false` |

### `src/store/ui.test.ts`

Synchronous store — no repo mock needed.

| Action                | Cases                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `setSidebarCollapsed` | Updates `sidebarCollapsed`                                                                     |
| `setSelectedProject`  | Updates `selectedProjectId`; resets `selectedTaskId` to `null`; resets `activeFilters` to `{}` |
| `setSelectedTask`     | Updates `selectedTaskId`                                                                       |
| `setFilters`          | Merges partial filters over existing `activeFilters`                                           |

### `src/store/projects.test.ts`

Same repo mock pattern as `tasks.test.ts`.

| Action          | Cases                                 |
| --------------- | ------------------------------------- |
| `loadProjects`  | Populates `projects` from repo        |
| `createProject` | Appends new project to end of list    |
| `updateProject` | Replaces the correct project in-place |
| `deleteProject` | Removes project from list             |

### `src/store/tags.test.ts`

Same repo mock pattern.

| Action      | Cases                         |
| ----------- | ----------------------------- |
| `loadTags`  | Populates `tags` from repo    |
| `createTag` | Appends new tag               |
| `updateTag` | Replaces correct tag in-place |
| `deleteTag` | Removes tag from list         |

---

## Files to Extend

### `src/store/tasks.test.ts` — missing actions

| Action           | Cases                                            |
| ---------------- | ------------------------------------------------ |
| `updateTask`     | Replaces the updated task in state               |
| `uncompleteTask` | Sets `completedAt` back to `null`                |
| `reorderTasks`   | Applies optimistic in-memory reorder immediately |
| `reorderTasks`   | Rolls back to previous state when repo throws    |

### `src/store/settings.test.ts` — missing settings

| Action                    | Cases                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadSettings`            | Restores `notificationsEnabled` from `"false"` string; restores `notificationTimes` from JSON; restores `parallaxEnabled` from `"false"`; defaults when keys absent |
| `setNotificationsEnabled` | Updates state + calls `setSetting("notification_enabled", ...)`                                                                                                     |
| `setNotificationTimes`    | Serialises array to JSON + calls `setSetting`                                                                                                                       |
| `setParallaxEnabled`      | Updates state + calls `setSetting("parallax_enabled", ...)`                                                                                                         |

---

## Conventions

- Follow existing patterns: `makeRepo()` factory, `vi.fn().mockResolvedValue(...)`, `beforeEach` state reset via `store.setState()`
- Co-locate new test files with their source (no new files under `src/test/`)
- No snapshot tests — assert specific values
- `isMac`-dependent functions: use `vi.spyOn` on `navigator` properties; restore after each test
