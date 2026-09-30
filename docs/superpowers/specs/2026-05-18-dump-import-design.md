# Dump / Import — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

## Overview

Add export and import capabilities so users can back up and restore their tasks, projects, and tags.
The feature lives in the existing SettingsDialog under a new "Données" section.
Export uses a Tauri save dialog; import uses a Tauri open dialog with a strategy choice (merge or replace).

---

## New Dependencies

| Layer             | Package                        | Purpose                               |
| ----------------- | ------------------------------ | ------------------------------------- |
| Rust (Cargo.toml) | `tauri-plugin-dialog = "2"`    | Native OS save/open file dialog       |
| Rust (Cargo.toml) | `tauri-plugin-fs = "2"`        | Read/write files from Rust-backed API |
| JS (package.json) | `@tauri-apps/plugin-dialog`    | JS bindings for dialog plugin         |
| JS (package.json) | `@tauri-apps/plugin-fs`        | JS bindings for fs plugin             |
| Permissions       | `dialog:default`, `fs:default` | Tauri capability permissions          |

Register both plugins in `src-tauri/src/lib.rs` via `.plugin(tauri_plugin_dialog::init())` and `.plugin(tauri_plugin_fs::init())`.
Add permissions to the relevant capability file under `src-tauri/capabilities/`.

---

## Data Format

```ts
interface ExportData {
  version: 1;
  exportedAt: string; // ISO 8601
  projects: Project[];
  tags: Tag[];
  tasks: Task[]; // tags[] embedded per task
}
```

`version` is reserved for future migrations.
All existing type definitions from `src/types/index.ts` are reused as-is — no new types needed there.

---

## Export Options

```ts
interface ExportOptions {
  activeTasks: boolean; // deletedAt = null && completedAt = null
  completedTasks: boolean; // completedAt != null && deletedAt = null
  archivedTasks: boolean; // deletedAt != null
  projects: boolean;
  tags: boolean;
}
```

Default: all checkboxes checked.

---

## Files to Create / Modify

### New: `src/lib/dataTransfer.ts`

Pure TypeScript module, no side effects.

- `ExportData` type (defined here, re-exported)
- `ExportOptions` type
- `exportData(repo: TodoRepository, options: ExportOptions): Promise<ExportData>`
  - Calls `repo.getTasks({ allTasks: true })` and filters per options
  - Calls `repo.getProjects()` and `repo.getTags()` when their checkbox is checked
  - Returns the assembled `ExportData` object

### Modified: `src/db/repository.ts`

Add one method to `TodoRepository`:

```ts
bulkImport(data: ExportData, strategy: 'merge' | 'replace'): Promise<void>;
```

### Modified: `src/db/sqlite-repository.ts`

Implement `bulkImport`:

- **merge strategy**: `INSERT OR REPLACE INTO` for projects, tags, tasks, task_tags.  
  Task tags: delete existing rows for each task then re-insert.
- **replace strategy**: Run `DELETE FROM task_tags; DELETE FROM tasks; DELETE FROM tags; DELETE FROM projects;` in a single transaction, then insert all incoming data.

Both strategies run inside a SQLite transaction for atomicity.

### Modified: `src/components/layout/SettingsDialog.tsx`

New "Données" section added to the right column (below Sidebar views and Notifications, separated by a divider).

**Export subsection:**

- 5 checkboxes: _Tâches actives_, _Tâches complétées_, _Tâches archivées_, _Projets_, _Tags_
- "Exporter" button → calls `dialog.save({ defaultPath: 'usagi-backup-YYYY-MM-DD.json' })` then `fs.writeTextFile(path, json)`

**Import subsection:**

- "Importer" button → calls `dialog.open({ filters: [{ name: 'JSON', extensions: ['json'] }] })`
- On file selected: parse + validate, open `ImportConfirmDialog`

### New: `src/components/layout/ImportConfirmDialog.tsx`

Standalone dialog component (uses existing `Dialog` from shadcn/ui).

Props:

```ts
interface ImportConfirmDialogProps {
  data: ExportData;
  onConfirm: (strategy: "merge" | "replace") => void;
  onCancel: () => void;
}
```

Content:

- Summary: "X tâches, Y projets, Z tags"
- Two strategy buttons: **Fusionner** / **Remplacer**
- Destructive warning (red text) when "Remplacer" is hovered/focused: "Toutes vos données actuelles seront supprimées."

### Modified: `src/i18n/locales/fr.ts` and `src/i18n/locales/en.ts`

New key group `data`:

```ts
data: {
  title: "Données",
  export: "Exporter",
  import: "Importer",
  activeTasks: "Tâches actives",
  completedTasks: "Tâches complétées",
  archivedTasks: "Tâches archivées",
  exportProjects: "Projets",
  exportTags: "Tags",
  importConfirmTitle: "Importer les données",
  importSummary: "{{tasks}} tâches, {{projects}} projets, {{tags}} tags",
  merge: "Fusionner",
  replace: "Remplacer",
  replaceWarning: "Toutes vos données actuelles seront supprimées.",
  exportSuccess: "Export réussi",
  importSuccess: "Import réussi",
  exportError: "Échec de l'export",
  importError: "Fichier invalide ou corrompu",
}
```

---

## Error Handling

- If dialog is cancelled (returns `null`), silently abort.
- If `fs.writeTextFile` fails, show a toast/alert with `data.exportError`.
- If JSON parse fails or `version` is missing/unknown, show `data.importError` and abort before showing the confirm dialog.
- `bulkImport` errors bubble to the UI as `data.importError`.

---

## Testing

- `exportData` is pure TypeScript → unit-testable with a `MemoryRepository` (already exists in `src/test-harness/`).
- `bulkImport` (merge + replace) → unit-tested in `sqlite-repository.test.ts`.
- No Playwright tests needed for this feature (file dialog is OS-native and not scriptable in headless mode).

---

## Out of Scope

- Settings are not included in the dump (theme, notifications, shortcuts).
- No versioned migration logic for now (only `version: 1` recognized).
- No partial failure recovery (all-or-nothing per transaction).
