# Quick Tag Creation from Project Context Menu

**Date:** 2026-06-14  
**Status:** Approved

## Overview

When right-clicking a project in the sidebar, the user can quickly create one or more tags scoped to that project. The tag form appears as a hover-triggered sub-panel adjacent to the "New tag" item in the context menu.

## User Flow

1. User right-clicks a project in the sidebar → a `ContextMenu` opens (Edit / New tag / Delete)
2. User hovers over "New tag" → a sub-panel slides in to the right of the menu
3. Sub-panel contains: label ("New tag for _ProjectName_"), name input (autofocused), color picker (8 presets), tag preview, Enter / Create button
4. User types a name, picks a color, presses Enter → tag is created scoped to the project
5. Form resets (name cleared, color reset to default), sub-panel stays open, input refocuses
6. User can create another tag immediately, or close the context menu (Escape / click outside) to dismiss everything

## Architecture

### Component affected

**`src/components/layout/Sidebar.tsx`** — `ProjectNavItem` component only.

No new files are needed. All changes are self-contained within `ProjectNavItem`.

### State added to `ProjectNavItem`

```ts
const [contextMenuOpen, setContextMenuOpen] = useState(false); // new — drives ContextMenu
const [tagPanelOpen, setTagPanelOpen] = useState(false);       // drives the hover sub-panel
const [tagName, setTagName] = useState("");
const [tagColor, setTagColor] = useState<string>(PRESET_COLORS[5]);
const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

`menuOpen` (existing) continues to drive the ⋮ `DropdownMenu` unchanged.

### Right-click trigger

Replace the current hack:

```tsx
onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); }}
```

With a proper base-ui `ContextMenu` wrapping the project item. `ContextMenu` is already in `src/components/ui/context-menu.tsx` and used in `TagManager`.

### The ⋮ DropdownMenu

Kept as-is, with one addition: a "New tag" `DropdownMenuItem` between Edit and the separator. Clicking it sets `tagPanelOpen(true)` and `menuOpen(false)`, then opens the sub-panel via Popover (same Popover component used by the hover path).

### Hover sub-panel (anti-flickering logic)

The sub-panel is a controlled `Popover` (base-ui) with `open={tagPanelOpen}`. The "New tag" item is wrapped in a `PopoverTrigger` (using its `render` prop to compose with the menu item), which serves as the positional anchor. The Popover renders into a portal outside the menu, so it is never clipped.

```tsx
<Popover open={tagPanelOpen} onOpenChange={setTagPanelOpen}>
  <PopoverTrigger
    render={
      <ContextMenuItem
        onMouseEnter={handleNewTagMouseEnter}
        onMouseLeave={handleNewTagMouseLeave}
      >
        <Tag className="h-3.5 w-3.5" />
        {t("project.newTag")}
        <ChevronRight className="ml-auto h-3 w-3" />
      </ContextMenuItem>
    }
  />
  <PopoverContent
    side="right"
    sideOffset={4}
    onMouseEnter={handleSubPanelMouseEnter}
    onMouseLeave={handleSubPanelMouseLeave}
  >
    {/* tag form */}
  </PopoverContent>
</Popover>
```

Anti-flickering: both the trigger item and the sub-panel share a `closeTimerRef`. Mouse leaving either side starts a 150ms timer; mouse entering either side cancels it.

```tsx
function handleNewTagMouseEnter() {
  if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  setTagPanelOpen(true);
}
function handleNewTagMouseLeave() {
  closeTimerRef.current = setTimeout(() => setTagPanelOpen(false), 150);
}
function handleSubPanelMouseEnter() {
  if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
}
function handleSubPanelMouseLeave() {
  closeTimerRef.current = setTimeout(() => setTagPanelOpen(false), 150);
}
```

When the `ContextMenu` or `DropdownMenu` closes (`onOpenChange` → false), `setTagPanelOpen(false)` is called immediately to clean up.

The same `Popover` + hover pattern is reused inside the `DropdownMenu` for the ⋮ button path.

### Tag sub-panel content

```text
┌────────────────────────────────┐
│ NEW TAG FOR [ProjectName]      │  ← 10px uppercase muted label
│                                │
│ [  Tag name…               ]   │  ← Input, autofocus on open
│                                │
│ ● ● ● ● ● ● ● ●               │  ← 8 PRESET_COLORS swatches
│                                │
│ ● UI review      (preview)     │  ← live preview, hidden when name empty
│                                │
│ ↵ Enter to create   [Create]   │
└────────────────────────────────┘
```

On submit (`Enter` or `Create` button):

- Calls `useTagStore.createTag(repo, { name: tagName.trim(), color: tagColor, projectId: project.id })`
- Resets `tagName = ""`, `tagColor = PRESET_COLORS[5]`
- Sub-panel stays open, input refocuses

### i18n

Two new keys added to `en.ts` and `fr.ts`:

| Key                 | EN                       | FR                            |
|---------------------|--------------------------|-------------------------------|
| `project.newTag`    | `"New tag"`              | `"Nouveau tag"`               |
| `project.newTagFor` | `"New tag for {{name}}"` | `"Nouveau tag pour {{name}}"` |

## Data Flow

```text
right-click project
  → ContextMenu opens
    → hover "New tag"
      → Popover opens (tagPanelOpen = true)
        → user types name + picks color
          → Enter / Create
            → useTagStore.createTag(repo, { name, color, projectId })
              → tag added to store + DB
            → form reset, Popover stays open
```

## Out of Scope

- No changes to `TagManager`, `TagStore`, `repository`, or any other file
- No validation beyond `name.trim().length > 0` (disabled Create button, Enter no-op when empty)
- No duplicate name check (consistent with existing tag creation behavior)
- No color name labels in the picker (consistent with existing `TagManager`)
