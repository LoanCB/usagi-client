# UI Modernization — Design Spec

**Date:** 2026-04-17  
**Status:** Approved  

## Goal

Modernize Usagi's UI to be more professional and friendly. The current theme is monochrome (gray/black). The new design introduces a violet/indigo identity with matching dark and light themes, a redesigned sidebar, and an enriched task list header.

---

## 1. Color Palette

### Light Theme (`src/theme/themes/light.ts` + `:root` in `src/index.css`)

| Token | Value | Role |
|---|---|---|
| `--background` | `oklch(0.98 0.005 280)` | App background — off-white lavender |
| `--foreground` | `oklch(0.13 0.02 280)` | Main text — near black with violet tint |
| `--card` | `oklch(1 0 0)` | Card surface — pure white |
| `--card-foreground` | `oklch(0.13 0.02 280)` | Card text |
| `--popover` | `oklch(1 0 0)` | Popover surface |
| `--popover-foreground` | `oklch(0.13 0.02 280)` | Popover text |
| `--primary` | `oklch(0.52 0.22 280)` | Violet — buttons, active states, accents |
| `--primary-foreground` | `oklch(0.98 0 0)` | White text on primary |
| `--secondary` | `oklch(0.94 0.03 280)` | Lavender pale — hover states |
| `--secondary-foreground` | `oklch(0.13 0.02 280)` | Text on secondary |
| `--muted` | `oklch(0.94 0.03 280)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.55 0.03 280)` | Muted text — gray-violet |
| `--accent` | `oklch(0.94 0.03 280)` | Same as secondary |
| `--accent-foreground` | `oklch(0.13 0.02 280)` | Text on accent |
| `--border` | `oklch(0.90 0.02 280)` | Subtle lavender border |
| `--input` | `oklch(0.90 0.02 280)` | Input border |
| `--ring` | `oklch(0.52 0.22 280)` | Focus ring — matches primary |
| `--radius` | `0.625rem` | Unchanged |
| `--priority-high` | `oklch(0.577 0.245 27.325)` | Unchanged |
| `--priority-medium` | `oklch(0.769 0.188 70.08)` | Unchanged |
| `--priority-low` | `oklch(0.627 0.194 149.214)` | Unchanged |

**Sidebar-specific tokens (light):**
| Token | Value |
|---|---|
| `--sidebar` | `oklch(0.16 0.06 280)` | Dark indigo sidebar background |
| `--sidebar-foreground` | `oklch(0.92 0.02 280)` | Light lavender text |
| `--sidebar-primary` | `oklch(0.62 0.18 280)` | Lighter violet for active items on dark bg |
| `--sidebar-primary-foreground` | `oklch(0.98 0 0)` | White |
| `--sidebar-accent` | `oklch(0.22 0.05 280)` | Slightly lighter indigo for hover |
| `--sidebar-accent-foreground` | `oklch(0.92 0.02 280)` | |
| `--sidebar-border` | `oklch(1 0 0 / 8%)` | Subtle white border |
| `--sidebar-ring` | `oklch(0.62 0.18 280)` | |

---

### Dark Theme (`src/theme/themes/dark.ts` + `.dark` in `src/index.css`)

Slate Dark style — deep blue-slate background, indigo/violet accents.

| Token | Value | Role |
|---|---|---|
| `--background` | `oklch(0.13 0.02 255)` | Deep slate (~`#0f172a`) |
| `--foreground` | `oklch(0.94 0.01 255)` | Near-white slate text |
| `--card` | `oklch(0.18 0.02 255)` | Card surface (~`#1e293b`) |
| `--card-foreground` | `oklch(0.94 0.01 255)` | |
| `--popover` | `oklch(0.18 0.02 255)` | |
| `--popover-foreground` | `oklch(0.94 0.01 255)` | |
| `--primary` | `oklch(0.62 0.18 280)` | Indigo-violet, visible on dark bg |
| `--primary-foreground` | `oklch(0.98 0 0)` | White |
| `--secondary` | `oklch(0.22 0.02 255)` | Slightly lighter slate |
| `--secondary-foreground` | `oklch(0.94 0.01 255)` | |
| `--muted` | `oklch(0.22 0.02 255)` | |
| `--muted-foreground` | `oklch(0.55 0.02 255)` | Muted slate text |
| `--accent` | `oklch(0.22 0.02 255)` | |
| `--accent-foreground` | `oklch(0.94 0.01 255)` | |
| `--border` | `oklch(1 0 0 / 8%)` | Subtle white border |
| `--input` | `oklch(1 0 0 / 12%)` | |
| `--ring` | `oklch(0.62 0.18 280)` | |
| `--radius` | `0.625rem` | Unchanged |
| `--priority-high` | `oklch(0.637 0.237 25.331)` | Unchanged |
| `--priority-medium` | `oklch(0.828 0.189 84.429)` | Unchanged |
| `--priority-low` | `oklch(0.696 0.17 162.48)` | Unchanged |

**Sidebar-specific tokens (dark):**
| Token | Value |
|---|---|
| `--sidebar` | `oklch(0.18 0.02 255)` | Same as card — slate medium |
| `--sidebar-foreground` | `oklch(0.94 0.01 255)` | |
| `--sidebar-primary` | `oklch(0.62 0.18 280)` | Violet accent |
| `--sidebar-primary-foreground` | `oklch(0.98 0 0)` | |
| `--sidebar-accent` | `oklch(0.24 0.02 255)` | Hover state |
| `--sidebar-accent-foreground` | `oklch(0.94 0.01 255)` | |
| `--sidebar-border` | `oklch(1 0 0 / 8%)` | |
| `--sidebar-ring` | `oklch(0.62 0.18 280)` | |

---

## 2. Sidebar (`src/components/layout/Sidebar.tsx`)

### Changes

**Background:** Use `bg-sidebar` instead of `bg-secondary`. This gives the sidebar the dark indigo color in light mode and slate in dark mode.

**Nav items — active state:**
```
bg-sidebar-primary/15 text-sidebar-foreground font-medium border-l-2 border-sidebar-primary
```

**Nav items — inactive:**
```
text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border-l-2 border-transparent
```

**Count badges:** Change from `bg-foreground/[0.06] text-muted-foreground/70` to `bg-sidebar-primary text-white` (filled pill, more visible).

**Section labels** ("VUES", "PROJETS"): Change to `text-sidebar-foreground/40` for contrast on dark sidebar.

**Settings button** at the bottom: same text color as nav items (`text-sidebar-foreground/60`), hover `text-sidebar-foreground`.

**Collapse toggle button:** Use `text-sidebar-foreground/60 hover:text-sidebar-foreground`.

---

## 3. TaskList Header (`src/components/layout/TaskList.tsx`)

Replace the current simple `<h2> + <Button>` header with a structured header block.

### New header structure

```tsx
<div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
  {/* Row 1: Title + Add button */}
  <div className="flex items-center justify-between mb-1">
    <h2 className="font-semibold text-base">{getTitle()}</h2>
    <TaskForm ...><Button .../></TaskForm>
  </div>

  {/* Row 2: Subtitle — date + remaining count badge (today/all views only) */}
  {showProgress && (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs text-muted-foreground">{formattedDate}</span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
        {remainingCount} restantes
      </span>
    </div>
  )}

  {/* Row 3: Progress bar (today/all views only, only if tasks exist) */}
  {showProgress && totalCount > 0 && (
    <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${(completedCount / totalCount) * 100}%` }}
      />
    </div>
  )}
</div>
```

**`showProgress`** is true when `selectedProjectId === "today"` or `selectedProjectId === undefined` (all tasks).

**`formattedDate`**: current date formatted in the active locale (reuse existing `i18n.language`).

`remainingCount` = tasks not completed. `totalCount` = all tasks in view. `completedCount` = totalCount - remainingCount.

These counts come from the already-loaded `tasks` array in `TaskList` — no new store queries needed.

---

## 4. TaskItem (`src/components/tasks/TaskItem.tsx`)

### Card-style layout

Replace the flat `border-b` row with card-style items:

**Before:**
```
border-b border-l-[3px] border-border/50 hover:bg-accent/40
```

**After:**
```
mx-2 my-1 rounded-lg border border-border bg-card shadow-sm hover:shadow-md
border-l-[3px] transition-shadow
```

- Outer wrapper: `mx-2 my-1` for spacing between cards
- `rounded-lg` corners
- `shadow-sm` → `hover:shadow-md` for subtle lift on hover
- `bg-card` explicitly (white in light, slate card in dark)
- Border left (priority color) kept — visually integrated with the rounded card

**Selected state:** `ring-2 ring-primary/50 bg-accent/30` instead of just `bg-accent`

**Completed task:** Add `opacity-60` on the whole card + existing line-through text.

---

## 5. Files to Modify

| File | Change |
|---|---|
| `src/theme/themes/light.ts` | Full token update |
| `src/theme/themes/dark.ts` | Full token update |
| `src/index.css` | Update `:root` and `.dark` CSS vars to match new tokens |
| `src/components/layout/Sidebar.tsx` | Background, nav item styles, badges, labels |
| `src/components/layout/TaskList.tsx` | New header with date, progress badge, progress bar |
| `src/components/tasks/TaskItem.tsx` | Card-style layout, shadow, ring on selected |

No new files needed. No new store queries. No new dependencies.

---

## Out of Scope

- Stat cards (À faire / En cours / Terminées / Total) — not included per user choice
- Tiptap editor styling — no changes
- Settings dialog — no changes
- Tag manager — no changes
- Mobile/responsive layout — no changes
