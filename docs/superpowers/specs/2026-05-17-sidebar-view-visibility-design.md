# Sidebar View Visibility Settings

**Date:** 2026-05-17  
**Status:** Approved

## Summary

Add checkboxes in the Settings dialog to let the user show or hide specific sidebar navigation views (Calendar, Archives, Tags). A checked box means the view is visible in the sidebar; unchecked means it is hidden.

## Scope

Three views are togglable: **Calendar**, **Archives**, **Tags**.  
"Today" and "All Tasks" are always visible and are not part of this feature.

## Architecture

### 1. `src/store/settings.ts`

Add three new boolean fields to `SettingsStore`:

| Field             | DB key             | Default |
| ----------------- | ------------------ | ------- |
| `calendarVisible` | `calendar_visible` | `true`  |
| `archivesVisible` | `archives_visible` | `true`  |
| `tagsVisible`     | `tags_visible`     | `true`  |

Each field gets a dedicated setter following the existing pattern (`setCalendarVisible`, `setArchivesVisible`, `setTagsVisible`), each calling `repo.setSetting(key, String(enabled))` then `set({...})`.

`loadSettings` reads the three keys; missing key → default `true` (backwards-compatible with existing installations).

### 2. `src/components/layout/SettingsDialog.tsx`

Add a new section in the **right column**, inserted above the existing Notifications section, separated by a `<div className="h-px bg-border" />` divider.

Section structure (mirrors existing checkbox rows for glassmorphism/parallax):

```
<p>  settings.sidebarViews  (section label)  </p>
<label> <Checkbox id="calendar-toggle" /> {t("nav.calendar")} </label>
<label> <Checkbox id="archives-toggle" /> {t("nav.archives")} </label>
<label> <Checkbox id="tags-toggle" />     {t("nav.tags")}     </label>
```

Labels reuse the existing `nav.*` translation keys — no new view-name strings needed.

### 3. `src/components/layout/Sidebar.tsx`

Read the three new flags from `useSettingsStore`. Conditionally render each NavItem:

- `calendarVisible` gates the Calendar `<NavItem>`
- `archivesVisible` gates the Archives `<NavItem>`
- `tagsVisible` gates the Tags `<NavItem>`

**Redirect on hide:** after reading `selectedProjectId` and the visibility flags, if the currently selected view is now hidden, call `setSelectedProject(undefined)` (= "All Tasks") as a side-effect. Implement with a `useEffect` that watches both the selected project and the three visibility flags.

### 4. `src/i18n/locales/en.ts` and `fr.ts`

One new translation key inside `settings`:

| Key                     | EN                | FR                     |
| ----------------------- | ----------------- | ---------------------- |
| `settings.sidebarViews` | `"Sidebar views"` | `"Vues de la sidebar"` |

View labels (`nav.calendar`, `nav.archives`, `nav.tags`) are reused from existing translations.

## Behavior

- **Default state:** all three views visible (all boxes checked). Existing installations load `true` for any missing DB key.
- **Unchecking a view:** its `NavItem` disappears from the sidebar immediately.
- **Active view hidden:** a `useEffect` in `Sidebar` detects the conflict and calls `setSelectedProject(undefined)`, redirecting to "All Tasks".
- **Sidebar collapsed:** same conditional rendering applies — the icon disappears.

## Out of scope

- "Today" and "All Tasks" are not hideable.
- No reordering of views.
- No per-project or per-device granularity.
