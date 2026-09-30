# Quick Tag Creation from Project Context Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover-triggered sub-panel to the project right-click context menu that lets users quickly create tags scoped to that project, with the form resetting after each creation so multiple tags can be created in one session.

**Architecture:** Replace the `onContextMenu → setMenuOpen` hack in `ProjectNavItem` with a proper base-ui `ContextMenu`. Add a native submenu (base-ui's `SubmenuRoot`/`SubmenuTrigger`) to both the right-click `ContextMenu` and the ⋮ `DropdownMenu`, sharing a single `TagCreationForm` component defined at the top of `Sidebar.tsx`. New submenu primitives are added to `context-menu.tsx` following the exact same pattern already used in `dropdown-menu.tsx`.

**Tech Stack:** React 18, base-ui (`@base-ui/react`), Zustand, Tailwind CSS, i18next, Vitest + Testing Library

---

## Files Changed

- `src/i18n/locales/en.ts` — add 2 keys to `project` section
- `src/i18n/locales/fr.ts` — add 2 keys to `project` section
- `src/components/ui/context-menu.tsx` — add `ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent`
- `src/components/layout/Sidebar.tsx` — modify `ProjectNavItem`, add `TagCreationForm` component
- `src/test/Sidebar.test.tsx` — add describe block with 4 tests

---

## Task 1: Add i18n keys

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Add keys to en.ts**

In `src/i18n/locales/en.ts`, inside the `project:` object, after the `options:` line (currently line 8 of the `project` block), add:

```ts
newTag: "New tag",
newTagFor: "New tag for {{name}}",
```

The `project` block should end up with these new entries between `options` and `deleteTitle`:

```ts
project: {
  new: "New project",
  edit: "Edit project",
  namePlaceholder: "Project name",
  delete: "Delete",
  options: "Project options",
  newTag: "New tag",
  newTagFor: "New tag for {{name}}",
  deleteTitle: 'Delete "{{name}}"?',
  // ... rest unchanged
},
```

- [ ] **Step 2: Add keys to fr.ts**

In `src/i18n/locales/fr.ts`, inside the `project:` object, after `options:` (line ~93), add:

```ts
newTag: "Nouveau tag",
newTagFor: "Nouveau tag pour {{name}}",
```

Result (fr.ts `project` block excerpt):

```ts
project: {
  new: "Nouveau projet",
  edit: "Modifier le projet",
  namePlaceholder: "Nom du projet",
  delete: "Supprimer",
  options: "Options du projet",
  newTag: "Nouveau tag",
  newTagFor: "Nouveau tag pour {{name}}",
  deleteTitle: 'Supprimer "{{name}}" ?',
  // ... rest unchanged
},
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors. The `fr.ts` file uses `typeof en` as its type, so adding keys to `en.ts` first forces TypeScript to require them in `fr.ts` too.

---

## Task 2: Extend context-menu.tsx with submenu primitives

**Files:**

- Modify: `src/components/ui/context-menu.tsx`

base-ui's `ContextMenu` exports `SubmenuRoot` and `SubmenuTrigger`. This task adds wrappers following the same pattern as `DropdownMenuSub`/`DropdownMenuSubTrigger`/`DropdownMenuSubContent` in `dropdown-menu.tsx`.

- [ ] **Step 1: Add ChevronRight to the lucide import**

In `context-menu.tsx`, the current import is:

```ts
import { Check } from "lucide-react";
```

Change it to:

```ts
import { Check, ChevronRight } from "lucide-react";
```

- [ ] **Step 2: Add ComponentProps to the React import**

Current import (line 3):

```ts
import type { ComponentProps } from "react";
```

Already imported — no change needed.

- [ ] **Step 3: Add the three new components before the export block**

Add these three components immediately before the `export {` block at the bottom of `src/components/ui/context-menu.tsx`:

```tsx
function ContextMenuSub({
  ...props
}: ContextMenuPrimitive.SubmenuRoot.Props) {
  return (
    <ContextMenuPrimitive.SubmenuRoot
      data-slot="context-menu-sub"
      {...props}
    />
  );
}

function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-slot="context-menu-sub-trigger"
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-3 w-3 opacity-60" />
    </ContextMenuPrimitive.SubmenuTrigger>
  );
}

function ContextMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-sub-content"
          className={cn(
            "z-50 min-w-[200px] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}
```

- [ ] **Step 4: Add the three new names to the export block**

```tsx
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
```

- [ ] **Step 5: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

---

## Task 3: Write failing tests

**Files:**

- Modify: `src/test/Sidebar.test.tsx`

- [ ] **Step 1: Add imports at the top of the test file**

Add these imports after the existing ones in `src/test/Sidebar.test.tsx`:

```ts
import { waitFor } from "@testing-library/react";
import { getRepository } from "@/store/repository";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import type { Project } from "@/types";
```

> Note: `getRepository` is already mocked via `vi.mock("@/store/repository", ...)` at the top of the file. `useProjectStore` may already be imported — check and skip if so.

- [ ] **Step 2: Add the new describe block at the bottom of the test file**

```tsx
describe("ProjectNavItem — quick tag creation", () => {
  const mockProject: Project = {
    id: "proj-1",
    name: "Design",
    color: "#3b82f6",
    icon: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockCreateTag = vi.fn().mockResolvedValue({
    id: "tag-1",
    name: "UI review",
    color: "#3b82f6",
    projectId: "proj-1",
  });

  beforeEach(() => {
    setupStores();
    useProjectStore.setState({ projects: [mockProject] });
    useTagStore.setState({
      tags: [],
      createTag: mockCreateTag,
      loadTags: vi.fn(),
      updateTag: vi.fn(),
      deleteTag: vi.fn(),
    });
  });

  it('shows "New tag" in the context menu when right-clicking a project', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Design"),
    });

    expect(await screen.findByText(/new tag/i)).toBeInTheDocument();
  });

  it("shows the tag name input when hovering the New tag submenu trigger", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Design"),
    });

    const newTagTrigger = await screen.findByText(/new tag/i);
    await user.hover(newTagTrigger);

    expect(
      await screen.findByPlaceholderText(/tag name/i),
    ).toBeInTheDocument();
  });

  it("calls createTag with the correct projectId on Enter", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Design"),
    });

    const newTagTrigger = await screen.findByText(/new tag/i);
    await user.hover(newTagTrigger);

    const input = await screen.findByPlaceholderText(/tag name/i);
    await user.type(input, "UI review");
    await user.keyboard("{Enter}");

    expect(mockCreateTag).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "UI review",
        projectId: "proj-1",
      }),
    );
  });

  it("clears the name input after tag creation", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Design"),
    });

    const newTagTrigger = await screen.findByText(/new tag/i);
    await user.hover(newTagTrigger);

    const input = await screen.findByPlaceholderText(/tag name/i);
    await user.type(input, "UI review");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
pnpm exec vitest run src/test/Sidebar.test.tsx
```

Expected: the 4 new tests fail. The existing tests should still pass.

---

## Task 4: Implement `TagCreationForm` and update `ProjectNavItem`

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`

This is the core implementation. It has several steps.

- [ ] **Step 1: Update imports**

Replace the current import block at the top of `src/components/layout/Sidebar.tsx` with this updated version:

```tsx
import {
  ArchiveX,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  Settings2,
  Tag,
  Tags,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logoUrl from "@/assets/logo.png";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { DeleteProjectDialog } from "@/components/projects/DeleteProjectDialog";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRESET_COLORS } from "@/lib/colors";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project } from "@/types";
```

- [ ] **Step 2: Add `TagCreationForm` before `NavItem`**

Add this component definition immediately before the `function NavItem(` line:

```tsx
interface TagCreationFormProps {
  readonly projectName: string;
  readonly tagName: string;
  readonly tagColor: string;
  readonly tagInputRef: React.RefObject<HTMLInputElement | null>;
  readonly onTagNameChange: (name: string) => void;
  readonly onTagColorChange: (color: string) => void;
  readonly onSubmit: () => void;
}

function TagCreationForm({
  projectName,
  tagName,
  tagColor,
  tagInputRef,
  onTagNameChange,
  onTagColorChange,
  onSubmit,
}: TagCreationFormProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {t("project.newTagFor", { name: projectName })}
      </p>
      <Input
        ref={tagInputRef}
        autoFocus
        placeholder={t("tag.namePlaceholder")}
        value={tagName}
        onChange={(e) => onTagNameChange(e.target.value)}
        className="h-7 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="h-4 w-4 rounded-full transition-transform hover:scale-110 focus:outline-none"
            style={{
              background: c,
              outline: tagColor === c ? `2px solid ${c}` : undefined,
              outlineOffset: tagColor === c ? "2px" : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onTagColorChange(c);
            }}
            aria-label={t("common.colorOption", { color: c })}
          />
        ))}
      </div>
      {tagName.trim() && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/30 w-fit">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: tagColor }}
          />
          <span className="text-xs truncate max-w-[9rem]">{tagName.trim()}</span>
        </div>
      )}
      <Button
        size="sm"
        className="w-full"
        disabled={!tagName.trim()}
        onClick={(e) => {
          e.stopPropagation();
          onSubmit();
        }}
      >
        {t("common.create")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Update `ProjectNavItem` state**

Inside `function ProjectNavItem(...)`, add the following new state after the existing `const [deleteOpen, setDeleteOpen] = useState(false);` line:

```tsx
const [tagName, setTagName] = useState("");
const [tagColor, setTagColor] = useState<string>(PRESET_COLORS[5]);
const tagInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 4: Add `handleCreateTag` to `ProjectNavItem`**

Add this async function inside `ProjectNavItem`, after the existing `handleConfirmDelete` function:

```tsx
async function handleCreateTag() {
  if (!tagName.trim()) return;
  await useTagStore.getState().createTag(getRepository(), {
    name: tagName.trim(),
    color: tagColor,
    projectId: project.id,
  });
  setTagName("");
  setTagColor(PRESET_COLORS[5]);
  tagInputRef.current?.focus();
}
```

- [ ] **Step 5: Replace the `ProjectNavItem` return statement**

Replace the entire `return (...)` block of `ProjectNavItem` (from `return (` through the final `);`) with this new version:

```tsx
const projectButton = (
  <TooltipProvider delay={collapsed ? 300 : 600}>
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        className={cn(
          "group flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm transition-colors",
          "border-l-2 border-transparent",
          "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
          active &&
            "bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary",
        )}
        onClick={onClick}
      >
        {icon}
        {!collapsed && (
          <>
            <span className="truncate flex-1 text-left">{project.name}</span>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-sidebar-foreground/10 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("project.options")}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem
                  render={
                    <button
                      type="button"
                      className="w-full flex items-center gap-2"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      {t("common.edit")}
                    </button>
                  }
                />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tag className="h-3.5 w-3.5" />
                    {t("project.newTag")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="p-3 w-52">
                    <TagCreationForm
                      projectName={project.name}
                      tagName={tagName}
                      tagColor={tagColor}
                      tagInputRef={tagInputRef}
                      onTagNameChange={setTagName}
                      onTagColorChange={setTagColor}
                      onSubmit={handleCreateTag}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{project.name}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

return (
  <>
    {collapsed ? (
      projectButton
    ) : (
      <ContextMenu>
        <ContextMenuTrigger>{projectButton}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              setEditOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("common.edit")}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Tag className="h-3.5 w-3.5" />
              {t("project.newTag")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <TagCreationForm
                projectName={project.name}
                tagName={tagName}
                tagColor={tagColor}
                tagInputRef={tagInputRef}
                onTagNameChange={setTagName}
                onTagColorChange={setTagColor}
                onSubmit={handleCreateTag}
              />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("common.delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )}
    <ProjectForm
      project={project}
      open={editOpen}
      onOpenChange={setEditOpen}
    />
    <DeleteProjectDialog
      project={project}
      open={deleteOpen}
      onConfirm={handleConfirmDelete}
      onCancel={() => setDeleteOpen(false)}
    />
  </>
);
```

- [ ] **Step 6: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

---

## Task 5: Run all tests

- [ ] **Step 1: Run the full test suite**

```bash
pnpm exec vitest run
```

Expected: all existing tests pass, all 4 new tests pass.

- [ ] **Step 2: If any new test fails — diagnose**

The most likely failure point is the submenu hover interaction in jsdom. If `user.hover(newTagTrigger)` doesn't open the submenu (because base-ui's submenu hover relies on pointer events that jsdom doesn't fully simulate), replace the hover with a click in the test:

```ts
// Instead of:
await user.hover(newTagTrigger);
// Use:
await user.pointer({ keys: "[MouseLeft]", target: newTagTrigger });
```

base-ui's `SubmenuTrigger` also opens on click, so this is equivalent for testing purposes.

- [ ] **Step 3: Run the Sidebar tests specifically to confirm green**

```bash
pnpm exec vitest run src/test/Sidebar.test.tsx
```

Expected output:

```text
✓ Sidebar — view visibility (4 tests)
✓ Sidebar — redirect on active view hidden (4 tests)
✓ ProjectNavItem — quick tag creation (4 tests)
```
