# DnD Visual Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live-reorder sortable DnD in the sidebar with a static list + intentional drop indicators (insertion line, group border, merge ring) and a shake animation on the dragged ghost.

**Architecture:** Remove `@dnd-kit/sortable` from the sidebar entirely; use `useDraggable` on project items and a `onDragMove` hit-test against DOM rects to compute `dropState` (React state). Visual feedback components (`DropIndicator`, prop-driven styles on `ProjectNavItem` and `ProjectGroupNavItem`) read from `dropState` and re-render reactively.

**Tech Stack:** React 18, TypeScript, @dnd-kit/core (keep), @dnd-kit/sortable (remove from sidebar), Tailwind CSS v4, dnd-kit `DragOverlay`.

## Global Constraints

- No git commands (forbidden per project rules)
- Do NOT use `window.prompt()` — Tauri WebView blocks it
- `@base-ui/react` ContextMenuItem uses `onClick` not `onSelect`
- Tailwind v4 — use `className` strings, not `style` for colors where possible; inline `style` for dynamic group colors
- `arrayMove` from `@dnd-kit/sortable` can still be imported for reorder logic — only `SortableContext`, `verticalListSortingStrategy`, `useSortable`, `CSS` are removed
- TypeScript strict — no implicit `any`, no unused variables
- Run `npx tsc --noEmit` after each task to verify no type errors

---

### Task 1: Add shake animation to `src/index.css`

**Files:**

- Modify: `src/index.css`

**Interfaces:**

- Produces: CSS class `.dnd-dragging` usable anywhere via `className="dnd-dragging"`

- [ ] **Step 1: Add the keyframes and class**

Open `src/index.css` and append after the existing `@keyframes` blocks (before or after the glassmorphism section — pick the end of the file):

```css
/* ── Drag-and-drop animations ──────────────────────────────── */
@keyframes dnd-shake {
  0%,
  100% {
    transform: rotate(-1.5deg);
  }
  50% {
    transform: rotate(1.5deg);
  }
}
.dnd-dragging {
  animation: dnd-shake 0.15s ease-in-out infinite;
}
```

- [ ] **Step 2: Verify the app still compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (CSS is not type-checked, just confirm no import issues).

---

### Task 2: Create `DropIndicator` component

**Files:**

- Create: `src/components/layout/DropIndicator.tsx`

**Interfaces:**

- Produces: `<DropIndicator color?: string />` — renders a 2px horizontal line with 5px circles at each end. `color` defaults to `hsl(var(--sidebar-primary))`.

- [ ] **Step 1: Create the file**

```tsx
interface DropIndicatorProps {
  color?: string;
}

export function DropIndicator({
  color = "hsl(var(--sidebar-primary))",
}: DropIndicatorProps) {
  return (
    <div className="relative flex items-center my-0.5 px-2 pointer-events-none">
      <div
        className="h-[5px] w-[5px] rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 h-[2px]" style={{ backgroundColor: color }} />
      <div
        className="h-[5px] w-[5px] rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep DropIndicator
```

Expected: no output (no errors).

---

### Task 3: Add `isDragOver` prop to `ProjectGroupNavItem`

**Files:**

- Modify: `src/components/layout/ProjectGroupNavItem.tsx`

**Interfaces:**

- Consumes: nothing new from other tasks
- Produces: `ProjectGroupNavItemProps` gains `isDragOver: boolean`; when true → group forced expanded, dashed border in group color, tinted background

- [ ] **Step 1: Update the props interface and component**

Replace the `ProjectGroupNavItemProps` interface and component signature:

```tsx
interface ProjectGroupNavItemProps {
  group: ProjectGroup;
  projects: Project[];
  collapsed: boolean;
  isDragOver?: boolean;
}

export function ProjectGroupNavItem({
  group,
  projects,
  collapsed,
  isDragOver = false,
}: ProjectGroupNavItemProps) {
```

- [ ] **Step 2: Use `isDragOver` to force expansion and add visual feedback**

Inside the component, change the `isCollapsed` computation so drag-over forces open:

```tsx
const isCollapsed = isDragOver ? false : collapsedGroupIds.has(group.id);
```

- [ ] **Step 3: Wrap the group content in a styled container**

The group header `<button>` and the children rendered by the parent (in Sidebar) need a shared container to get the dashed border. Wrap the `<ContextMenu>` + `<Dialog>` return in a `<div>` with conditional styling:

```tsx
// At the top of the non-collapsed return, replace:
//   return (
//     <>
//       <ContextMenu>...
// with:
return (
  <div
    className={cn(
      "rounded-md transition-all",
      isDragOver && "border-2 border-dashed",
    )}
    style={
      isDragOver
        ? {
            borderColor: group.color,
            backgroundColor: `${group.color}1a`, // ~10% opacity hex suffix
          }
        : undefined
    }
  >
    <ContextMenu>{/* ... existing content unchanged ... */}</ContextMenu>

    <Dialog
      open={editOpen}
      onOpenChange={(o) => {
        if (!o) setEditOpen(false);
      }}
    >
      {/* ... existing dialog unchanged ... */}
    </Dialog>
  </div>
);
```

**Note:** The closing `</>` fragment becomes `</div>`. The `<Dialog>` must remain inside this wrapper div (it renders a portal, so the wrapper div doesn't affect its visual position).

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep ProjectGroupNavItem
```

Expected: no output.

---

### Task 4: Rewrite DnD in `Sidebar.tsx` — remove sortable, add `dropState` + `onDragMove`

This is the core task. It rewrites the DnD section of `Sidebar.tsx` while leaving all non-DnD code untouched.

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**

- Consumes: `DropIndicator` from Task 2; `isDragOver` prop on `ProjectGroupNavItem` from Task 3
- Produces: working DnD with static list, `dropState`, `onDragMove` hit-test

#### Step 1: Update imports

- [ ] **Remove** these imports:

```tsx
// REMOVE:
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

- [ ] **Add** these imports:

```tsx
// ADD:
import { arrayMove } from "@dnd-kit/sortable"; // keep arrayMove, drop the rest
import { useDraggable } from "@dnd-kit/core";
import { FolderPlus } from "lucide-react";
import { DropIndicator } from "@/components/layout/DropIndicator";
```

#### Step 2: Update `ProjectNavItemProps` and `ProjectNavItem`

- [ ] **Replace** the props interface:

```tsx
interface ProjectNavItemProps {
  readonly project: Project;
  readonly active: boolean;
  readonly collapsed: boolean;
  readonly onClick: () => void;
  readonly isMergeTarget?: boolean;
  readonly itemRef?: (el: HTMLDivElement | null) => void;
}
```

- [ ] **Replace** the `useSortable` call and `sortableStyle` inside `ProjectNavItem`:

```tsx
// REMOVE these lines:
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: `project:${project.id}` });

const sortableStyle = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.4 : 1,
};

// ADD these lines:
const {
  attributes,
  listeners,
  setNodeRef: setDragRef,
  isDragging,
} = useDraggable({ id: `project:${project.id}` });
```

- [ ] **Update** the outer `<div>` to use the new refs and remove `sortableStyle`:

```tsx
// REMOVE:
<div ref={setNodeRef} style={sortableStyle} {...attributes} {...listeners}>

// ADD:
<div
  ref={(el) => {
    setDragRef(el);
    itemRef?.(el);
  }}
  style={{ opacity: isDragging ? 0.3 : 1 }}
  {...attributes}
  {...listeners}
>
```

- [ ] **Add** `isMergeTarget` visual feedback to the project button.

Find the `projectButton` variable. On the `<TooltipTrigger render={<button type="button" />} className={cn(...)}` element, append to the `className`:

```tsx
isMergeTarget && "ring-2 ring-sidebar-primary animate-pulse",
```

And add the `FolderPlus` overlay inside the button, after the icon and before the name span, only when not collapsed and isMergeTarget:

```tsx
{
  !collapsed && isMergeTarget && (
    <FolderPlus className="h-3 w-3 shrink-0 text-sidebar-primary" />
  );
}
```

Place it between the icon and the name `<span>`:

```tsx
{
  icon;
}
{
  !collapsed && isMergeTarget && (
    <FolderPlus className="h-3 w-3 shrink-0 text-sidebar-primary" />
  );
}
{
  !collapsed && (
    <>
      <span className="truncate flex-1 text-left">{project.name}</span>
      {/* ... DropdownMenu ... */}
    </>
  );
}
```

#### Step 3: Add `dropState` type and state to `Sidebar`

- [ ] **Add** the type definition above the `Sidebar` function (or near `SidebarItem`):

```tsx
type DropState =
  | { intent: "reorder"; beforeId: string | null }
  | { intent: "merge"; targetId: string }
  | { intent: "join-group"; groupId: string }
  | null;
```

- [ ] **Replace** `dropIntentRef` in the `Sidebar` component body with `dropState`:

```tsx
// REMOVE:
const dropIntentRef = useRef<"merge" | "reorder" | null>(null);

// ADD:
const [dropState, setDropState] = useState<DropState>(null);
const itemRectsRef = useRef<Map<string, DOMRect>>(new Map());
```

#### Step 4: Add `itemRef` callback builder

- [ ] **Add** this helper inside the `Sidebar` function body (after `itemRectsRef`):

```tsx
function makeItemRef(dndId: string) {
  return (el: HTMLDivElement | null) => {
    if (el) {
      itemRectsRef.current.set(dndId, el.getBoundingClientRect());
    } else {
      itemRectsRef.current.delete(dndId);
    }
  };
}
```

**Note:** `getBoundingClientRect()` is called at mount/update time. For items that move (e.g. after reorder), the rect is refreshed on re-render when the ref callback fires again. This is sufficient for DnD purposes.

#### Step 5: Replace `handleDragStart`, remove old `handleDragOver`, add `onDragMove`

- [ ] **Replace** `handleDragStart`:

```tsx
function handleDragStart({ active }: DragStartEvent) {
  const id = String(active.id);
  if (id.startsWith("project:")) setActiveProjectId(id.slice(8));
  setDropState(null);
  // Refresh all rects at drag start so we have fresh values
  itemRectsRef.current.clear();
  document.querySelectorAll("[data-dnd-item]").forEach((el) => {
    const id = (el as HTMLElement).dataset.dndItem;
    if (id) itemRectsRef.current.set(id, el.getBoundingClientRect());
  });
}
```

- [ ] **Replace** `handleDragOver` (the previous version that used `active.rect`) with `onDragMove`:

```tsx
function handleDragMove({
  active,
  delta,
}: import("@dnd-kit/core").DragMoveEvent) {
  const activeId = String(active.id);
  if (!activeId.startsWith("project:")) return;
  const draggedProjectId = activeId.slice(8);
  const draggedProject = projects.find((p) => p.id === draggedProjectId);
  if (!draggedProject) return;

  // Current pointer Y = initial rect center + delta
  const initialRect = active.rect.current.initial;
  if (!initialRect) return;
  const pointerY = initialRect.top + initialRect.height / 2 + delta.y;

  // Walk sidebar items in order, skip the dragged item itself
  for (const item of sidebarItems) {
    if (item.dndId === activeId) continue;
    const rect = itemRectsRef.current.get(item.dndId);
    if (!rect) continue;

    const topZone = rect.top + rect.height * 0.3;
    const midZone = rect.top + rect.height * 0.7;

    if (pointerY < topZone) {
      // Insert before this item
      setDropState({ intent: "reorder", beforeId: item.dndId });
      return;
    }
    if (pointerY < midZone) {
      // Merge / join-group intent
      if (item.type === "group") {
        setDropState({ intent: "join-group", groupId: item.group.id });
      } else {
        // Only offer merge for standalone projects (not items inside a group)
        if (!item.project.groupId) {
          setDropState({ intent: "merge", targetId: item.dndId });
        } else {
          setDropState({ intent: "join-group", groupId: item.project.groupId });
        }
      }
      return;
    }
    // else: pointer is in bottom 30%, continue to next item
  }

  // Pointer is below all items → append at end
  setDropState({ intent: "reorder", beforeId: null });
}
```

#### Step 6: Rewrite `handleDragEnd` to use `dropState`

- [ ] **Replace** the entire `handleDragEnd` function:

```tsx
function handleDragEnd({ active }: DragEndEvent) {
  setActiveProjectId(null);
  const currentDrop = dropState;
  setDropState(null);

  const activeId = String(active.id);
  if (!activeId.startsWith("project:")) return;

  const draggedProjectId = activeId.slice(8);
  const draggedProject = projects.find((p) => p.id === draggedProjectId);
  if (!draggedProject) return;

  const repo = getRepository();

  if (!currentDrop) {
    // Dropped outside — ungroup if needed
    if (draggedProject.groupId) {
      assignToGroup(repo, draggedProjectId, null);
    }
    return;
  }

  if (currentDrop.intent === "join-group") {
    assignToGroup(repo, draggedProjectId, currentDrop.groupId);
    return;
  }

  if (currentDrop.intent === "merge") {
    const targetProjectId = currentDrop.targetId.slice(8); // targetId is "project:<id>"
    const targetProject = projects.find((p) => p.id === targetProjectId);
    if (!targetProject) return;
    if (targetProject.groupId) {
      assignToGroup(repo, draggedProjectId, targetProject.groupId);
    } else {
      setPendingGroupProjects({
        projectA: draggedProject,
        projectB: targetProject,
      });
    }
    return;
  }

  if (currentDrop.intent === "reorder") {
    const { beforeId } = currentDrop;

    // Build the ordered list of top-level dndIds (groups + standalone projects)
    const topLevel = sidebarItems.filter(
      (i) => i.type === "group" || (i.type === "project" && !i.project.groupId),
    );

    // If dragged project is inside a group, handle intra-group reorder separately
    if (draggedProject.groupId) {
      const groupProjects = projects
        .filter((p) => p.groupId === draggedProject.groupId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const ids = groupProjects.map((p) => p.id);
      const oldIdx = ids.indexOf(draggedProjectId);
      // beforeId for intra-group: find which group-project dndId we're before
      const beforeProjectId = beforeId?.startsWith("project:")
        ? beforeId.slice(8)
        : null;
      const newIdx = beforeProjectId
        ? ids.indexOf(beforeProjectId)
        : ids.length;
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const adjusted = newIdx > oldIdx ? newIdx - 1 : newIdx;
        const newOrder = arrayMove(ids, oldIdx, adjusted);
        reorderProjects(repo, newOrder);
      }
      return;
    }

    // Top-level reorder
    const topLevelIds = topLevel.map((i) => i.dndId);
    const dragDndId = `project:${draggedProjectId}`;
    const oldIdx = topLevelIds.indexOf(dragDndId);
    const newIdx = beforeId
      ? topLevelIds.indexOf(beforeId)
      : topLevelIds.length;
    if (oldIdx === -1 || newIdx === -1) return;
    if (oldIdx === newIdx) return;
    const adjusted = newIdx > oldIdx ? newIdx - 1 : newIdx;
    const reordered = arrayMove(topLevelIds, oldIdx, adjusted);

    const newGroupOrder = reordered
      .filter((id) => id.startsWith("group:"))
      .map((id) => id.slice(6));
    const newProjectOrder = reordered
      .filter((id) => id.startsWith("project:"))
      .map((id) => id.slice(8));
    if (newGroupOrder.length > 0) reorderGroups(repo, newGroupOrder);
    if (newProjectOrder.length > 0) reorderProjects(repo, newProjectOrder);
  }
}
```

#### Step 7: Update `DndContext` JSX — remove `SortableContext`, add `onDragMove`, add `data-dnd-item` attrs

- [ ] **Replace** the `DndContext` + `SortableContext` block in the JSX:

```tsx
// REMOVE:
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  <SortableContext
    items={sidebarItems.map((i) => i.dndId)}
    strategy={verticalListSortingStrategy}
  >
    {sidebarItems.map((item) => { ... })}
  </SortableContext>
  <DragOverlay>...</DragOverlay>
</DndContext>

// ADD:
<DndContext
  sensors={sensors}
  onDragStart={handleDragStart}
  onDragMove={handleDragMove}
  onDragEnd={handleDragEnd}
>
  {sidebarItems.map((item, index) => {
    // Show DropIndicator BEFORE this item if dropState says so
    const showIndicatorBefore =
      dropState?.intent === "reorder" &&
      dropState.beforeId === item.dndId;

    if (item.type === "group") {
      const isGroupDragOver =
        dropState?.intent === "join-group" &&
        dropState.groupId === item.group.id;
      return (
        <div key={item.group.id} data-dnd-item={item.dndId}>
          {showIndicatorBefore && <DropIndicator />}
          <ProjectGroupNavItem
            group={item.group}
            projects={item.projects}
            collapsed={sidebarCollapsed}
            isDragOver={isGroupDragOver}
          />
        </div>
      );
    }

    const isMergeTarget =
      dropState?.intent === "merge" &&
      dropState.targetId === item.dndId;

    return (
      <div key={item.project.id} data-dnd-item={item.dndId}>
        {showIndicatorBefore && <DropIndicator />}
        <ProjectNavItem
          project={item.project}
          active={selectedProjectId === item.project.id}
          collapsed={sidebarCollapsed}
          onClick={() => setSelectedProject(item.project.id)}
          isMergeTarget={isMergeTarget}
          itemRef={makeItemRef(item.dndId)}
        />
      </div>
    );
  })}
  {/* DropIndicator at the END of the list */}
  {dropState?.intent === "reorder" && dropState.beforeId === null && (
    <DropIndicator />
  )}
  <DragOverlay>
    {activeProjectId ? (
      <div className="dnd-dragging opacity-90 rounded-md bg-sidebar-accent px-3 py-2 text-sm shadow-lg cursor-grabbing">
        {projects.find((p) => p.id === activeProjectId)?.name}
      </div>
    ) : null}
  </DragOverlay>
</DndContext>
```

- [ ] **Remove** unused imports from `@dnd-kit/core` if `closestCenter` is no longer used:

```tsx
// REMOVE from dnd-kit/core imports:
closestCenter,
type DragOverEvent,
```

- [ ] **Verify TypeScript** — run:

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: only the pre-existing `tasks.test.ts` error, nothing new.

#### Step 8: Update `data-dnd-item` refresh strategy

The `makeItemRef` approach fires on mount but doesn't refresh on scroll or resize. For the `onDragStart` refresh, we already re-read from DOM. Add a refresh in `onDragMove` for the first call only:

- [ ] **Add** a `hasFreshRectsRef` ref:

```tsx
const hasFreshRectsRef = useRef(false);
```

- [ ] **In `handleDragStart`**, set it to `false`:

```tsx
hasFreshRectsRef.current = false;
```

- [ ] **At the top of `handleDragMove`**, before the hit-test loop, refresh once:

```tsx
if (!hasFreshRectsRef.current) {
  itemRectsRef.current.clear();
  document.querySelectorAll("[data-dnd-item]").forEach((el) => {
    const id = (el as HTMLElement).dataset.dndItem;
    if (id) itemRectsRef.current.set(id, el.getBoundingClientRect());
  });
  hasFreshRectsRef.current = true;
}
```

---

### Task 5: Final verification

**Files:** none modified

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "tasks.test.ts"
```

Expected: no output.

- [ ] **Step 2: Manual smoke test checklist**

Start the app and verify:

1. **Static list during drag** — drag a project: the other items do NOT move
2. **Shake animation** — the DragOverlay ghost wiggles left-right continuously
3. **Drop line** — as you drag, a 2px colored line with end-circles appears between items showing insertion point
4. **Group expand + dashed border** — drag a project over a group header: the group opens and gets a dashed colored border
5. **Merge ring** — drag a project slowly over another standalone project (center): the target gets a pulsing ring + folder icon
6. **Reorder commits to DB** — drop at new position → page reload preserves the new order
7. **Group creation** — drop centered on standalone project → `CreateGroupDialog` opens
8. **Join group** — drop centered on group → project moves into it
9. **Intra-group reorder** — drag project within an expanded group → reorders correctly
