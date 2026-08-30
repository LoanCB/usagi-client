# Priority Display Redesign — Task List

**Date:** 2026-06-05  
**Status:** Approved  
**Scope:** `TaskItem.tsx` only

## Problem

The current priority indicator is a 3px colored left border on the task card. It is too subtle — easy to overlook and provides no scannable pattern.

## Solution

Replace the left border with two combined visual signals:

1. **A small glowing dot** — positioned between the checkbox and the task title
2. **A tinted card background + border** — very subtle, same semantic color

Colors are **fixed and theme-independent** (red / orange / green) so the user never has to re-learn the priority scale when switching themes.

## Color Specification

| Priority | Dot color | Dot glow | Card background | Card border |
|----------|-----------|----------|-----------------|-------------|
| `high` | `#ef4444` | `0 0 5px rgba(239,68,68,0.7)` | `rgba(239,68,68,0.08)` | `rgba(239,68,68,0.20)` |
| `medium` | `#eab308` | `0 0 5px rgba(234,179,8,0.6)` | `rgba(234,179,8,0.07)` | `rgba(234,179,8,0.18)` |
| `low` | `#22c55e` | `0 0 5px rgba(34,197,94,0.5)` | `rgba(34,197,94,0.06)` | `rgba(34,197,94,0.15)` |
| `none` | transparent + subtle border | none | no change | existing card border |

## Changes

### `src/components/tasks/TaskItem.tsx`

1. **Remove** `PRIORITY_BORDER_COLORS` constant and `borderLeftColor` from the inline style.
2. **Add** `PRIORITY_DOT`, `PRIORITY_BG`, `PRIORITY_BORDER` constant maps using the fixed colors above.
3. **Update** the card's inline style to include `backgroundColor` and `borderColor` from those maps.
4. **Remove** `border-l-[3px]` from the card's className (keep the base `border`).
5. **Add** a `<span>` dot element (7×7px circle) between `<Checkbox>` and the project icon / title button.

### Out of scope

- `PrioritySelector.tsx` — unchanged (uses `--priority-*` CSS vars, lives in the detail panel)
- `FilterBar.tsx` — unchanged
- Theme files / CSS variables — unchanged

## Dot element markup

```tsx
<span
  className="shrink-0 rounded-full"
  style={{
    width: 7,
    height: 7,
    background: PRIORITY_DOT[task.priority],
    boxShadow: PRIORITY_GLOW[task.priority],
    border: task.priority === "none" ? "1.5px solid rgba(255,255,255,0.18)" : undefined,
  }}
/>
```
