# Copy Task Title — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

## Summary

Add a "Copy title" context menu item to the task right-click menu in `TaskItem.tsx`. When clicked, the task's title is copied to the system clipboard using the Web Clipboard API.

## Architecture

Single-file change: `src/components/tasks/TaskItem.tsx`  
Two i18n files: `src/i18n/locales/fr.ts` and `src/i18n/locales/en.ts`

## Menu Placement

New item at the **top** of the context menu, before the existing Archive/Delete actions, followed by a separator.

```
┌─────────────────────┐
│ 📋 Copier le titre  │  ← new
├─────────────────────┤  ← new separator
│ 🗄  Archiver        │
│ 🗑  Supprimer       │
├─────────────────────┤
│ Tags                │
└─────────────────────┘
```

## Implementation Details

- **Handler:** `navigator.clipboard.writeText(task.title)` — no external dependency
- **Icon:** `Copy` from `lucide-react`
- **i18n key:** `task.copyTitle` → `"Copy title"` (EN) / `"Copier le titre"` (FR)
- No store changes required — clipboard write is a side effect only

## Files to Change

1. `src/components/tasks/TaskItem.tsx` — add menu item + handler
2. `src/i18n/locales/en.ts` — add `task.copyTitle` key
3. `src/i18n/locales/fr.ts` — add `task.copyTitle` key
