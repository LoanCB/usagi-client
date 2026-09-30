# UI Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize Usagi's UI with a violet/indigo identity, a dark indigo sidebar (light) / slate sidebar (dark), and an enriched task list header with progress bar.

**Architecture:** Update CSS token values in `light.ts`, `dark.ts`, and `index.css` first (foundation), then restyle `Sidebar.tsx` to use the new sidebar tokens, then add the progress header to `TaskList.tsx`, and finally convert `TaskItem.tsx` to card-style layout.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, shadcn/ui, Vitest + Testing Library

---

## File Map

| File | What changes |
|---|---|
| `src/theme/themes/light.ts` | New violet/indigo token values |
| `src/theme/themes/dark.ts` | New slate/indigo token values |
| `src/index.css` | `:root` and `.dark` CSS vars synced with theme files |
| `src/components/layout/Sidebar.tsx` | Use sidebar tokens, new active/inactive styles, filled badges |
| `src/components/layout/TaskList.tsx` | New header: date subtitle + remaining badge + progress bar |
| `src/components/tasks/TaskItem.tsx` | Card-style layout with shadow, ring on selected, opacity on completed |

---

## Task 1: Update Light Theme Tokens

**Files:**
- Modify: `src/theme/themes/light.ts`
- Modify: `src/index.css` (`:root` block only)

- [ ] **Step 1: Update `src/theme/themes/light.ts`**

Replace the entire file content:

```ts
import type { Theme } from "../types";

export const lightTheme: Theme = {
  name: "light",
  tokens: {
    "--background": "oklch(0.98 0.005 280)",
    "--foreground": "oklch(0.13 0.02 280)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.13 0.02 280)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.13 0.02 280)",
    "--primary": "oklch(0.52 0.22 280)",
    "--primary-foreground": "oklch(0.98 0 0)",
    "--secondary": "oklch(0.94 0.03 280)",
    "--secondary-foreground": "oklch(0.13 0.02 280)",
    "--muted": "oklch(0.94 0.03 280)",
    "--muted-foreground": "oklch(0.55 0.03 280)",
    "--accent": "oklch(0.94 0.03 280)",
    "--accent-foreground": "oklch(0.13 0.02 280)",
    "--border": "oklch(0.90 0.02 280)",
    "--input": "oklch(0.90 0.02 280)",
    "--ring": "oklch(0.52 0.22 280)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.577 0.245 27.325)",
    "--priority-medium": "oklch(0.769 0.188 70.08)",
    "--priority-low": "oklch(0.627 0.194 149.214)",
  },
};
```

- [ ] **Step 2: Update `:root` block in `src/index.css`**

Replace the entire `:root { ... }` block (lines 51–84) with:

```css
:root {
    --background: oklch(0.98 0.005 280);
    --foreground: oklch(0.13 0.02 280);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.13 0.02 280);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.13 0.02 280);
    --primary: oklch(0.52 0.22 280);
    --primary-foreground: oklch(0.98 0 0);
    --secondary: oklch(0.94 0.03 280);
    --secondary-foreground: oklch(0.13 0.02 280);
    --muted: oklch(0.94 0.03 280);
    --muted-foreground: oklch(0.55 0.03 280);
    --accent: oklch(0.94 0.03 280);
    --accent-foreground: oklch(0.13 0.02 280);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.90 0.02 280);
    --input: oklch(0.90 0.02 280);
    --ring: oklch(0.52 0.22 280);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --radius: 0.625rem;
    --sidebar: oklch(0.16 0.06 280);
    --sidebar-foreground: oklch(0.92 0.02 280);
    --sidebar-primary: oklch(0.62 0.18 280);
    --sidebar-primary-foreground: oklch(0.98 0 0);
    --sidebar-accent: oklch(0.22 0.05 280);
    --sidebar-accent-foreground: oklch(0.92 0.02 280);
    --sidebar-border: oklch(1 0 0 / 8%);
    --sidebar-ring: oklch(0.62 0.18 280);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/theme/themes/light.ts src/index.css
git commit -m "feat: apply violet/indigo light theme tokens"
```

---

## Task 2: Update Dark Theme Tokens

**Files:**
- Modify: `src/theme/themes/dark.ts`
- Modify: `src/index.css` (`.dark` block only)

- [ ] **Step 1: Update `src/theme/themes/dark.ts`**

Replace the entire file content:

```ts
import type { Theme } from "../types";

export const darkTheme: Theme = {
  name: "dark",
  tokens: {
    "--background": "oklch(0.13 0.02 255)",
    "--foreground": "oklch(0.94 0.01 255)",
    "--card": "oklch(0.18 0.02 255)",
    "--card-foreground": "oklch(0.94 0.01 255)",
    "--popover": "oklch(0.18 0.02 255)",
    "--popover-foreground": "oklch(0.94 0.01 255)",
    "--primary": "oklch(0.62 0.18 280)",
    "--primary-foreground": "oklch(0.98 0 0)",
    "--secondary": "oklch(0.22 0.02 255)",
    "--secondary-foreground": "oklch(0.94 0.01 255)",
    "--muted": "oklch(0.22 0.02 255)",
    "--muted-foreground": "oklch(0.55 0.02 255)",
    "--accent": "oklch(0.22 0.02 255)",
    "--accent-foreground": "oklch(0.94 0.01 255)",
    "--border": "oklch(1 0 0 / 8%)",
    "--input": "oklch(1 0 0 / 12%)",
    "--ring": "oklch(0.62 0.18 280)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.637 0.237 25.331)",
    "--priority-medium": "oklch(0.828 0.189 84.429)",
    "--priority-low": "oklch(0.696 0.17 162.48)",
  },
};
```

- [ ] **Step 2: Update `.dark` block in `src/index.css`**

Replace the entire `.dark { ... }` block (lines 86–118) with:

```css
.dark {
    --background: oklch(0.13 0.02 255);
    --foreground: oklch(0.94 0.01 255);
    --card: oklch(0.18 0.02 255);
    --card-foreground: oklch(0.94 0.01 255);
    --popover: oklch(0.18 0.02 255);
    --popover-foreground: oklch(0.94 0.01 255);
    --primary: oklch(0.62 0.18 280);
    --primary-foreground: oklch(0.98 0 0);
    --secondary: oklch(0.22 0.02 255);
    --secondary-foreground: oklch(0.94 0.01 255);
    --muted: oklch(0.22 0.02 255);
    --muted-foreground: oklch(0.55 0.02 255);
    --accent: oklch(0.22 0.02 255);
    --accent-foreground: oklch(0.94 0.01 255);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 8%);
    --input: oklch(1 0 0 / 12%);
    --ring: oklch(0.62 0.18 280);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --sidebar: oklch(0.18 0.02 255);
    --sidebar-foreground: oklch(0.94 0.01 255);
    --sidebar-primary: oklch(0.62 0.18 280);
    --sidebar-primary-foreground: oklch(0.98 0 0);
    --sidebar-accent: oklch(0.24 0.02 255);
    --sidebar-accent-foreground: oklch(0.94 0.01 255);
    --sidebar-border: oklch(1 0 0 / 8%);
    --sidebar-ring: oklch(0.62 0.18 280);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/theme/themes/dark.ts src/index.css
git commit -m "feat: apply slate/indigo dark theme tokens"
```

---

## Task 3: Restyle Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

The sidebar needs to use `bg-sidebar` instead of `bg-secondary`, and nav items need violet active/hover states that work on the dark indigo background.

- [ ] **Step 1: Update `NavItem` component**

Replace the `NavItem` function (lines 39–71) with:

```tsx
function NavItem({ icon, label, active, collapsed, onClick, count }: NavItemProps) {
  const inner = (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm text-left transition-colors",
        "border-l-2 border-transparent",
        "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
        active && "bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {!collapsed && count !== undefined && (
        <span className="ml-auto text-xs bg-sidebar-primary text-sidebar-primary-foreground rounded-full min-w-[1.25rem] text-center px-1.5 py-0.5 leading-none shrink-0">
          {count}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger>{inner}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return inner;
}
```

- [ ] **Step 2: Update `ProjectNavItem` component**

Replace the `inner` button element inside `ProjectNavItem` (lines 103–152) with:

```tsx
  const inner = (
    <button
      className={cn(
        "group flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm text-left transition-colors",
        "border-l-2 border-transparent",
        "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
        active && "bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary"
      )}
      onClick={onClick}
    >
      {icon}
      {!collapsed && (
        <>
          <span className="truncate flex-1">{project.name}</span>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-sidebar-foreground/10 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('project.options')}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem
                render={
                  <button className="w-full flex items-center gap-2" onClick={() => { setMenuOpen(false); setEditOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                    {t('common.edit')}
                  </button>
                }
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {count !== undefined && (
            <span className="text-xs bg-sidebar-primary text-sidebar-primary-foreground rounded-full min-w-[1.25rem] text-center px-1.5 py-0.5 leading-none shrink-0">
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
```

- [ ] **Step 3: Update the Sidebar wrapper and section labels**

Replace the `Sidebar` function return JSX (the outer `<div>` starting at line 190) with:

```tsx
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      <div className="flex justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1.5 pb-2">
          {!sidebarCollapsed && (
            <p className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
              {t('nav.views')}
            </p>
          )}
          <NavItem
            icon={<Calendar className="h-4 w-4" />}
            label={t('nav.today')}
            active={selectedProjectId === "today"}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject("today")}
            count={todayCount}
          />
          <NavItem
            icon={<ListChecks className="h-4 w-4" />}
            label={t('nav.allTasks')}
            active={selectedProjectId === undefined}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject(undefined)}
            count={allCount}
          />
          <NavItem
            icon={<Tags className="h-4 w-4" />}
            label={t('nav.tags')}
            active={selectedProjectId === "tags"}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject("tags")}
          />
        </div>

        <Separator className="my-2 bg-sidebar-border" />

        <div className="space-y-1.5 pb-2">
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between px-3 py-1">
              <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                {t('nav.projects')}
              </p>
              <ProjectForm>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  aria-label={t('project.new')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </ProjectForm>
            </div>
          )}
          {projects.map((project) => (
            <ProjectNavItem
              key={project.id}
              project={project}
              active={selectedProjectId === project.id}
              collapsed={sidebarCollapsed}
              onClick={() => setSelectedProject(project.id)}
              count={tasks.filter((t) => !t.completedAt && t.projectId === project.id).length}
            />
          ))}
          {sidebarCollapsed && (
            <ProjectForm>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label={t('project.new')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </ProjectForm>
          )}
        </div>
      </ScrollArea>

      <SettingsDialog>
        <div className={cn(
          "flex border-t border-sidebar-border px-2 py-2",
          sidebarCollapsed ? "justify-center" : "justify-start"
        )}>
          <button
            type="button"
            className="flex items-center gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors text-sm"
            aria-label={t("settings.title")}
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>{t("settings.title")}</span>}
          </button>
        </div>
      </SettingsDialog>
    </div>
  );
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: restyle sidebar with violet/indigo tokens"
```

---

## Task 4: TaskList Header — Progress Bar

**Files:**
- Modify: `src/components/layout/TaskList.tsx`
- Create: `src/components/layout/TaskList.test.tsx`

The header gains a date subtitle, a "N restantes" badge, and a progress bar. These are only shown when viewing "Aujourd'hui" (`selectedProjectId === "today"`) or "Toutes les tâches" (`selectedProjectId === undefined`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/layout/TaskList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { TaskList } from '@/components/layout/TaskList';
import { useTaskStore } from '@/store/tasks';
import { useUIStore } from '@/store/ui';
import { useProjectStore } from '@/store/projects';
import * as repositoryModule from '@/store/repository';

const mockRepository = {} as any;

beforeEach(() => {
  vi.spyOn(repositoryModule, 'getRepository').mockReturnValue(mockRepository);
  useProjectStore.setState({ projects: [], loadProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), deleteProject: vi.fn() });
  useUIStore.setState({
    selectedProjectId: 'today',
    selectedTaskId: null,
    activeFilters: {},
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    setSelectedProject: vi.fn(),
    setSelectedTask: vi.fn(),
    setFilters: vi.fn(),
  });
  useTaskStore.setState({
    tasks: [],
    loading: false,
    loadTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    uncompleteTask: vi.fn(),
    deleteTask: vi.fn(),
    reorderTasks: vi.fn(),
  });
});

describe('TaskList header progress', () => {
  it('shows progress bar in today view when tasks exist', () => {
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 0 },
        { id: '2', title: 'Task 2', completedAt: '2026-04-17', dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 1 },
      ],
    }));
    render(<TaskList />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('does not show progress bar when no tasks', () => {
    useTaskStore.setState((s) => ({ ...s, tasks: [] }));
    render(<TaskList />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows remaining count badge in today view', () => {
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 0 },
        { id: '2', title: 'Task 2', completedAt: '2026-04-17', dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 1 },
      ],
    }));
    render(<TaskList />);
    expect(screen.getByText(/1 restante/i)).toBeInTheDocument();
  });

  it('does not show progress bar in a project view', () => {
    useUIStore.setState((s) => ({ ...s, selectedProjectId: 'proj-1' }));
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: 'proj-1', description: '', position: 0 },
      ],
    }));
    render(<TaskList />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows progress bar in all-tasks view (selectedProjectId undefined)', () => {
    useUIStore.setState((s) => ({ ...s, selectedProjectId: undefined }));
    useTaskStore.setState((s) => ({
      ...s,
      tasks: [
        { id: '1', title: 'Task 1', completedAt: null, dueDate: null, priority: 'none', tags: [], projectId: null, description: '', position: 0 },
      ],
    }));
    render(<TaskList />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test:run src/components/layout/TaskList.test.tsx
```

Expected: all 5 tests FAIL — `progressbar` not found, because it doesn't exist yet.

- [ ] **Step 3: Update `TaskList.tsx` with the new header**

At the top of the file, add this import after the existing imports:

```tsx
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
```

Then replace the header JSX inside `TaskList` (the `<div className="flex items-center justify-between px-4 py-3 border-b ...">` block, lines 172–180) with:

```tsx
      {/* Header */}
      {(() => {
        const showProgress = selectedProjectId === "today" || selectedProjectId === undefined;
        const totalCount = tasks.length;
        const completedCount = tasks.filter((t) => t.completedAt).length;
        const remainingCount = totalCount - completedCount;
        const locale = i18n.language === "fr" ? fr : enUS;
        const dateLabel = format(new Date(), "EEEE d MMMM", { locale });

        return (
          <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-base">{getTitle()}</h2>
              <TaskForm projectId={formProjectId}>
                <Button size="sm" variant="ghost" className="gap-1">
                  <Plus className="h-4 w-4" />
                </Button>
              </TaskForm>
            </div>
            {showProgress && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground capitalize">{dateLabel}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {remainingCount} restante{remainingCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {showProgress && totalCount > 0 && (
              <div
                role="progressbar"
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalCount}
                className="h-1 rounded-full bg-primary/15 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </div>
            )}
          </div>
        );
      })()}
```

Also add `i18n` to the existing `useTranslation` destructuring at the top of `TaskList`:

```tsx
  const { t, i18n } = useTranslation();
```

Note: `formProjectId` is already computed later in the component — move its definition before the header JSX:

```tsx
  const formProjectId =
    selectedProjectId === "today" || selectedProjectId === undefined
      ? null
      : selectedProjectId;
```

Remove the duplicate `formProjectId` declaration that was previously at line 162.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test:run src/components/layout/TaskList.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/TaskList.tsx src/components/layout/TaskList.test.tsx
git commit -m "feat: add progress header to TaskList (date, remaining badge, progress bar)"
```

---

## Task 5: TaskItem Card Style

**Files:**
- Modify: `src/components/tasks/TaskItem.tsx`

Convert the flat `border-b` row to a card-style item with shadow, rounded corners, and a ring on selected state.

- [ ] **Step 1: Update `TaskItem` JSX**

Replace the outer `<div>` inside `TaskItem` (the one with `ref={setNodeRef}` and `className={cn(...)}`, lines 49–57) with:

```tsx
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 mx-2 my-1 pl-3 pr-4 py-2.5",
        "rounded-lg border border-border border-l-[3px] bg-card",
        "shadow-sm hover:shadow-md transition-shadow",
        task.completedAt && "opacity-60",
        isSelected && "ring-2 ring-primary/50"
      )}
    >
```

- [ ] **Step 2: Remove the `hover:bg-accent/40` and `bg-accent` fallback (already replaced above)**

Verify the old classes `hover:bg-accent/40` and `isSelected && "bg-accent"` are no longer present in the file.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskItem.tsx
git commit -m "feat: convert TaskItem to card-style layout with shadow and ring"
```

---

## Self-Review

**Spec coverage:**
- ✅ Light theme tokens — Task 1
- ✅ Dark theme tokens — Task 2
- ✅ Sidebar: bg-sidebar, active/inactive nav items, filled badges, section labels, collapse toggle, settings button — Task 3
- ✅ TaskList header: date subtitle, remaining badge, progress bar, showProgress condition — Task 4
- ✅ TaskItem: card layout, shadow, ring on selected, opacity on completed — Task 5

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**
- `formProjectId` is moved before first use in Task 4 — no duplication.
- `i18n` is destructured from `useTranslation()` — matches existing pattern in `TaskItem.tsx`.
- `role="progressbar"` with `aria-valuenow/min/max` matches the test query `getByRole('progressbar')`.
