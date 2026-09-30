# Colorblind Mode — Implementation Spec

**Date:** 2026-06-09
**Status:** Approved

## Goal

Add an opt-in colorblind mode toggle in Settings. When enabled, the priority dot in each task row is replaced by a compact 3-bar intensity indicator. Background tint and border colors on the card are preserved (they provide extra context for non-colorblind users sharing the same screen).

## Visual Design

### Indicator: 3 vertical bars, aligned at bottom

Each bar is 3px wide × variable height, with 1.5px gaps. Total width ~13px, height 11px.

| Priority | Bar 1 (left) | Bar 2 (middle) | Bar 3 (right) |
|----------|-------------|----------------|---------------|
| `high`   | 4px, 100%   | 7px, 100%      | 11px, 100%    |
| `medium` | 4px, 100%   | 7px, 100%      | 4px, 20% opacity |
| `low`    | 4px, 100%   | 4px, 20% opacity | 4px, 20% opacity |
| `none`   | — (empty space, same width) | | |

Bar colors match the existing priority semantic colors: `#ef4444` (high), `#eab308` (medium), `#22c55e` (low). Glow: same box-shadow as the dot (`0 0 3px <color>/0.5`).

The bars element replaces the dot `<span>` in `TaskItem` — same position (after `<Checkbox>`), same `data-testid="priority-indicator"` for testing.

> Note: the dot keeps `data-testid="priority-dot"` and the bars get `data-testid="priority-bars"`. Both are wrapped in a container `<span data-testid="priority-indicator">` so tests can query by a stable ID regardless of mode.

## Settings

### Store (`src/store/settings.ts`)

- New field: `colorblindMode: boolean` — default `false`
- New action: `setColorblindMode(repo: TodoRepository, enabled: boolean): Promise<void>`
- DB key: `colorblind_mode`
- Load pattern (defaults to `false` when absent): `raw.colorblind_mode === "true"`

### UI (`src/components/layout/SettingsDialog.tsx`)

New `Switch` row added **below** the parallax toggle (line ~628), inside the same Appearance flex column. Follows exact same markup pattern as the glassmorphism/parallax rows:

```tsx
<div className="flex items-center justify-between cursor-pointer select-none">
  <span className="text-sm text-foreground">
    {t("settings.colorblindMode")}
  </span>
  <Switch
    checked={colorblindMode}
    onCheckedChange={(v) => setColorblindMode(getRepository(), v)}
  />
</div>
```

No dependency on glassmorphism or parallax — the toggle is always active.

### i18n

Add `colorblindMode` key to both locale files:

- `en.ts`: `"Colorblind mode"`
- `fr.ts`: `"Mode daltonien"`

## TaskItem changes (`src/components/tasks/TaskItem.tsx`)

1. Read `colorblindMode` from `useSettingsStore`.
2. Replace the bare dot `<span>` with a container `<span data-testid="priority-indicator">` that renders either the dot or the bars depending on the setting.
3. Add `PRIORITY_BARS_GLOW` constant (same structure as existing maps) for bar glow colors.

### New constant

```tsx
const PRIORITY_BARS_GLOW: Record<Priority, string> = {
  high: "0 0 3px rgba(239,68,68,0.5)",
  medium: "0 0 3px rgba(234,179,8,0.45)",
  low: "0 0 3px rgba(34,197,94,0.4)",
  none: "none",
};
```

### Rendered indicator (colorblind off — unchanged dot)

```tsx
<span data-testid="priority-indicator">
  <span
    data-testid="priority-dot"
    className="shrink-0 rounded-full"
    style={{ width: 7, height: 7, background: PRIORITY_DOT[task.priority], boxShadow: PRIORITY_GLOW[task.priority], border: task.priority === "none" ? "1.5px solid var(--border)" : undefined, marginLeft: 2 }}
  />
</span>
```

### Rendered indicator (colorblind on — bars)

```tsx
<span data-testid="priority-indicator">
  {task.priority !== "none" && (
    <span
      data-testid="priority-bars"
      className="shrink-0"
      style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 11, marginLeft: 2 }}
    >
      {[
        { height: 4, active: true },
        { height: 7, active: task.priority === "medium" || task.priority === "high" },
        { height: 11, active: task.priority === "high" },
      ].map((bar, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: bar.height,
            borderRadius: 1,
            background: PRIORITY_DOT[task.priority],
            opacity: bar.active ? 1 : 0.2,
            boxShadow: bar.active ? PRIORITY_BARS_GLOW[task.priority] : "none",
          }}
        />
      ))}
    </span>
  )}
  {task.priority === "none" && (
    <span style={{ width: 13, display: "inline-block" }} />
  )}
</span>
```

## Files modified

| File | Change |
|------|--------|
| `src/store/settings.ts` | `colorblindMode` field + `setColorblindMode` action + load |
| `src/components/layout/SettingsDialog.tsx` | New Switch row + store subscriptions |
| `src/components/tasks/TaskItem.tsx` | Conditional dot/bars rendering + `PRIORITY_BARS_GLOW` |
| `src/i18n/locales/en.ts` | `settings.colorblindMode: "Colorblind mode"` |
| `src/i18n/locales/fr.ts` | `settings.colorblindMode: "Mode daltonien"` |
| `src/store/settings.test.ts` | Tests for new store field |
| `src/test/TaskItem.test.tsx` | Tests for bars rendering |

## Out of scope

- No changes to `PrioritySelector`, `FilterBar`, or any other component.
- The bars are not animated (no transition between dot and bars on toggle).
- No per-theme variation of the bar colors.
