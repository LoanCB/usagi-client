# DnD Visual Feedback — Design Spec

Date: 2026-06-19

## Problem

The current drag-and-drop in the sidebar project list uses `@dnd-kit/sortable`, which animates items moving around in real time during drag. This makes it:
- Confusing for the reorder intent (items jump before the user releases)
- Non-functional for the group-creation intent (no visual distinction between "drop on" and "drop beside")

## Goals

1. Items stay in place during drag — no live reorder preview
2. A shake animation on the dragged ghost to signal it's being moved
3. A drop line indicator (Figma-style) between items for reorder intent
4. Group hover: dashed border + auto-expand + tinted background when dragging over a group
5. Merge hover: pulsing ring + FolderPlus icon overlay on standalone project target

## Architecture

### DnD Library Changes

Remove `SortableContext` and `verticalListSortingStrategy`. Items no longer use `useSortable`.

- `ProjectNavItem` uses `useDraggable({ id: "project:<id>" })` only
- Drop zones declared via `useDroppable` on each item
- `DragOverlay` renders the dragged project name with shake animation
- `DndContext` keeps `PointerSensor` with `activationConstraint: { distance: 8 }`

### Drop State

Replace `dropIntentRef` (ref) with `dropState` (React state) so visual indicators re-render reactively.

```ts
type DropState =
  | { intent: "reorder"; beforeId: string | null }  // insert before this dndId, null = append at end
  | { intent: "merge"; targetId: string }            // create group with this project
  | { intent: "join-group"; groupId: string }        // add to existing group
  | null;
```

Calculated in `onDragMove` by iterating over a `Map<string, DOMRect>` (populated via item `ref` callbacks) to find which gap the pointer's Y falls into.

**Zone thresholds per item:**
- Top 30% of item → insert before item (`reorder`)
- Middle 40% of item → merge with item or join group (`merge` / `join-group`)
- Bottom 30% of item → insert after item (`reorder`)

### `onDragMove` Algorithm

```
For each sidebar item (in order):
  Get its DOMRect from itemRectsRef
  If pointer.y < rect.top + rect.height * 0.3 → reorder before this item, break
  If pointer.y < rect.top + rect.height * 0.7 → merge/join-group with this item, break
  (else continue to next item)
If no item matched → reorder at end (beforeId: null)
```

Items belonging to a collapsed group are skipped in the hit-test (their rect is not registered).

## Visual Components

### `DropIndicator` (`src/components/layout/DropIndicator.tsx`)

```tsx
// 2px horizontal line with small circles at each end
// Props: color?: string (defaults to sidebar-primary CSS var)
// Rendered between items in the sidebar list when dropState.intent === "reorder"
```

### Shake animation (`src/index.css` or `globals.css`)

```css
@keyframes dnd-shake {
  0%, 100% { transform: rotate(-1.5deg); }
  50%       { transform: rotate(1.5deg); }
}
.dnd-dragging {
  animation: dnd-shake 0.15s ease-in-out infinite;
}
```

Applied to the `DragOverlay` inner div.

### Group hover state (`ProjectGroupNavItem`)

New prop: `isDragOver: boolean`

When true:
- Force group expanded (ignore `collapsedGroupIds` for rendering)
- Add `border-2 border-dashed rounded-md` with group color
- Add `bg-[groupColor]/10` tinted background

### Merge target state (`ProjectNavItem`)

New prop: `isMergeTarget: boolean`

When true:
- Add `ring-2 ring-sidebar-primary animate-pulse` to the item button
- Render `<FolderPlus className="h-3 w-3 absolute right-2" />` overlay

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/components/layout/DropIndicator.tsx` | Create — drop line component |
| `src/components/layout/Sidebar.tsx` | Major rewrite of DnD section — remove sortable, add dropState, onDragMove, DropIndicator rendering |
| `src/components/layout/ProjectGroupNavItem.tsx` | Add `isDragOver` prop |
| `src/index.css` | Add `@keyframes dnd-shake` and `.dnd-dragging` class |

Note: `ProjectNavItem` is defined inline in `Sidebar.tsx` — the `isMergeTarget` prop is added there directly.

## handleDragEnd Logic (unchanged semantics, uses dropState)

| dropState | Action |
|-----------|--------|
| `reorder, beforeId` | `reorderProjects` or `reorderGroups` to insert dragged item before `beforeId` |
| `merge, targetId` | Open `CreateGroupDialog` if both standalone, else `assignToGroup` |
| `join-group, groupId` | `assignToGroup(projectId, groupId)` |
| `null` / dropped outside | Ungroup if was in a group |

## Out of Scope

- Dragging group headers (only projects are draggable for now)
- Touch/mobile drag (PointerSensor handles both, no special treatment needed)
- Drag-to-scroll (sidebar has ScrollArea — not addressed in this spec)
