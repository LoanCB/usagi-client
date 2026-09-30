# Reset Shortcuts Button — Design Spec

**Date:** 2026-05-13

## Goal

Add a single "Reset to defaults" button in the Shortcuts section of the Settings dialog that resets all three sort shortcuts (`sortUrgency`, `sortDueDate`, `sortProject`) to their default values (`⌘S`, `⌘D`, `⌘P`) and persists the change.

## Architecture

### 1. Store — `src/store/shortcuts.ts`

Add a `resetShortcuts(repo: TodoRepository): Promise<void>` action to `ShortcutsStore`.

- Sets all three shortcuts back to `DEFAULT_SHORTCUTS`
- Persists via `repo.setSetting("sort_shortcuts", JSON.stringify({...}))` — same persistence pattern as `setShortcut`

### 2. UI — `src/components/layout/SettingsDialog.tsx`

Transform the Shortcuts section header from a plain `<p>` into a `flex items-center justify-between` row:

```
[RACCOURCIS label]        [↺ Réinitialiser button]
```

Button spec:
- `variant="ghost"`, `size="sm"`
- Icon: `RotateCcw` from lucide-react (already imported in the file via other icons)
- Classes: `h-7 gap-1 text-xs text-muted-foreground hover:text-foreground -my-1`
- Label: `t("settings.shortcutsReset")`
- onClick: `resetShortcuts(getRepository())`

### 3. i18n — both locale files

Add `shortcutsReset` key under the `settings` namespace:

- `src/i18n/locales/en.ts`: `shortcutsReset: "Reset to defaults"`
- `src/i18n/locales/fr.ts`: `shortcutsReset: "Réinitialiser"`

## Files to modify

| File | Change |
|------|--------|
| `src/store/shortcuts.ts` | Add `resetShortcuts` action to store interface + implementation |
| `src/components/layout/SettingsDialog.tsx` | Update shortcuts section header + add reset button + import `RotateCcw` |
| `src/i18n/locales/en.ts` | Add `settings.shortcutsReset` |
| `src/i18n/locales/fr.ts` | Add `settings.shortcutsReset` |

## Out of scope

- Per-row individual reset buttons (user wants a single global reset)
- Confirmation dialog before reset (easily reversible by re-recording shortcuts)
