# Settings Dialog — Refonte onglets — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructurer `SettingsDialog.tsx` en 3 onglets (Général / Notifications / Données) et remplacer les checkboxes d'export par des chips pill cliquables.

**Architecture:** Un état local `activeTab` contrôle quel panel est affiché. Le tab bar vit dans `DialogHeader` (sticky au scroll). Chaque panel reprend le JSX existant réorganisé, aucune logique métier ne change. Le panel Données introduit deux cards côte à côte (responsive `flex-col sm:flex-row`) avec des chips à la place des checkboxes.

**Tech Stack:** React, TypeScript, Tailwind CSS, i18next.

---

## Fichiers modifiés

| Fichier                                    | Nature                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/i18n/locales/en.ts`                   | Ajout de 2 clés : `settings.tabGeneral`, `data.importDescription` |
| `src/i18n/locales/fr.ts`                   | Même 2 clés en français                                           |
| `src/components/layout/SettingsDialog.tsx` | Restructuration JSX complète                                      |

---

### Task 1 : Ajouter les clés i18n manquantes

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1 : Ajouter `settings.tabGeneral` et `data.importDescription` dans `en.ts`**

Dans `src/i18n/locales/en.ts`, dans le bloc `settings`, ajouter après `sidebarViews` :

```ts
sidebarViews: "Sidebar views",
tabGeneral: "General",   // ← nouveau
```

Dans le bloc `data`, ajouter après `importSection` :

```ts
importSection: "Import",
importDescription:
  "Restore from a previously exported JSON file. You will choose to merge or replace your existing data.", // ← nouveau
```

- [ ] **Step 2 : Même chose dans `fr.ts`**

Dans `src/i18n/locales/fr.ts`, dans le bloc `settings` :

```ts
sidebarViews: "Vues de la sidebar",
tabGeneral: "Général",   // ← nouveau
```

Dans le bloc `data` :

```ts
importSection: "Importer",
importDescription:
  "Restaurer depuis un fichier JSON exporté depuis Usagi. Tu choisiras de fusionner ou remplacer tes données existantes.", // ← nouveau
```

- [ ] **Step 3 : Vérifier que TypeScript compile sans erreur**

```bash
cd /Users/loancb/projects/perso/usagi-client && pnpm tsc --noEmit 2>&1 | head -30
```

Résultat attendu : aucune erreur (ou uniquement des erreurs préexistantes non liées à i18n).

---

### Task 2 : Ajouter l'état `activeTab` et la tab bar

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1 : Ajouter l'état `activeTab` dans `SettingsDialog`**

Juste après la déclaration `const [dataError, setDataError] = useState<string | null>(null);` (ligne ~378), ajouter :

```tsx
const [activeTab, setActiveTab] = useState<
  "general" | "notifications" | "data"
>("general");
```

- [ ] **Step 2 : Remplacer le `DialogHeader` existant par la version avec tab bar**

Remplacer (autour de la ligne 485) :

```tsx
<DialogHeader>
  <DialogTitle>{t("settings.title")}</DialogTitle>
</DialogHeader>
```

par :

```tsx
<DialogHeader className="border-b border-border pb-0">
  <DialogTitle>{t("settings.title")}</DialogTitle>
  <div className="flex mt-3">
    {(
      [
        ["general", t("settings.tabGeneral")],
        ["notifications", t("settings.notifications")],
        ["data", t("data.title")],
      ] as ["general" | "notifications" | "data", string][]
    ).map(([id, label]) => (
      <button
        key={id}
        type="button"
        onClick={() => setActiveTab(id)}
        className={cn(
          "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
          activeTab === id
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
      </button>
    ))}
  </div>
</DialogHeader>
```

- [ ] **Step 3 : Remplacer le wrapper du contenu par un div sans flex-row**

La ligne actuelle (autour de 488) :

```tsx
<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col sm:flex-row">
```

devient :

```tsx
<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
```

(Le flex-row sera géré au niveau de chaque panel.)

- [ ] **Step 4 : Vérifier que TypeScript compile**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

---

### Task 3 : Panel Général (Apparence + Langue à gauche / Vues Sidebar + Raccourcis à droite)

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

Ce panel reprend exactement le contenu existant, réorganisé : Apparence et Langue restent à gauche, Raccourcis migre de la colonne gauche vers la colonne droite (sous Vues Sidebar). Les sections Notifications et Données disparaissent de ce panel.

- [ ] **Step 1 : Remplacer le contenu du div wrapper par les 3 panels conditionnels**

Remplacer tout le contenu du `div` de contenu (le bloc `flex flex-col sm:flex-row` actuel, depuis `{/* Left column */}` jusqu'à la fermeture du div) par :

```tsx
{
  /* ── Panel : Général ── */
}
{
  activeTab === "general" && (
    <div className="flex flex-col sm:flex-row py-4">
      {/* Left column: Appearance + Language */}
      <div className="flex-1 min-w-0 flex flex-col sm:pr-4">
        {/* Section: Appearance */}
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("settings.appearance")}
          </p>
          <div className="flex gap-1">
            {THEME_MODES.map(({ mode, icon: Icon, labelKey }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setThemeMode(mode)}
                aria-label={t(labelKey)}
                aria-pressed={themeMode === mode}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors",
                  themeMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground border border-input",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {CUSTOM_THEMES.map(({ mode, color, labelKey }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setThemeMode(mode)}
                aria-label={t(labelKey)}
                aria-pressed={themeMode === mode}
                style={{ flexBasis: "calc(33.333% - 0.167rem)" }}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors",
                  themeMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground border border-input",
                )}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                  aria-hidden
                />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-sm text-foreground">
              {t("settings.glassmorphism")}
            </span>
            <Switch
              checked={glassmorphismEnabled}
              onCheckedChange={(v) =>
                setGlassmorphismEnabled(getRepository(), v)
              }
            />
          </div>
          <div
            className={cn(
              "flex items-center justify-between cursor-pointer select-none",
              !glassmorphismEnabled && "pointer-events-none opacity-40",
            )}
          >
            <span className="text-sm text-foreground">
              {t("settings.parallax")}
            </span>
            <Switch
              checked={parallaxEnabled}
              onCheckedChange={(v) => setParallaxEnabled(getRepository(), v)}
            />
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Section: Language */}
        <div className="flex flex-col gap-3 py-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("settings.language")}
          </p>
          <div className="flex gap-1">
            {(["fr", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => i18n.changeLanguage(lang)}
                aria-label={lang === "fr" ? "Français" : "English"}
                aria-pressed={currentLang === lang}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-xs font-medium uppercase transition-colors",
                  currentLang === lang
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground border border-input",
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border sm:hidden" />
      <div className="hidden sm:block w-px bg-border flex-shrink-0" />

      {/* Right column: Sidebar Views + Shortcuts */}
      <div className="flex-1 min-w-0 flex flex-col pt-4 sm:pt-0 sm:pl-4">
        {/* Section: Sidebar views */}
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("settings.sidebarViews")}
          </p>
          <div className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-sm">{t("nav.calendar")}</span>
            <Switch
              aria-label={t("nav.calendar")}
              checked={calendarVisible}
              onCheckedChange={(v) => setCalendarVisible(getRepository(), v)}
            />
          </div>
          <div className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-sm">{t("nav.archives")}</span>
            <Switch
              aria-label={t("nav.archives")}
              checked={archivesVisible}
              onCheckedChange={(v) => setArchivesVisible(getRepository(), v)}
            />
          </div>
          <div className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-sm">{t("nav.tags")}</span>
            <Switch
              aria-label={t("nav.tags")}
              checked={tagsVisible}
              onCheckedChange={(v) => setTagsVisible(getRepository(), v)}
            />
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Section: Shortcuts */}
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.shortcuts")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground -my-1"
              onClick={() => resetShortcuts(getRepository())}
            >
              <RotateCcw className="h-3 w-3" />
              {t("settings.shortcutsReset")}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm pt-1 min-w-0 shrink">
                {t("settings.shortcutUrgency")}
              </span>
              <ShortcutInput
                shortcut={sortUrgency}
                onChange={(s) => handleShortcut("sortUrgency", s)}
                conflict={urgencyConflict}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm pt-1 min-w-0 shrink">
                {t("settings.shortcutDueDate")}
              </span>
              <ShortcutInput
                shortcut={sortDueDate}
                onChange={(s) => handleShortcut("sortDueDate", s)}
                conflict={dateConflict}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm pt-1 min-w-0 shrink">
                {t("settings.shortcutProject")}
              </span>
              <ShortcutInput
                shortcut={sortProject}
                onChange={(s) => handleShortcut("sortProject", s)}
                conflict={projectConflict}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier que TypeScript compile**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

---

### Task 4 : Panel Notifications

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1 : Ajouter le panel Notifications juste après la fermeture du panel Général**

```tsx
{
  /* ── Panel : Notifications ── */
}
{
  activeTab === "notifications" && (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {t("settings.notifications")}
      </p>

      {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox which renders a native input */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <Checkbox
          checked={notificationsEnabled}
          onCheckedChange={handleToggleEnabled}
        />
        <span className="text-sm">{t("settings.enableNotifications")}</span>
      </label>

      <div
        className={cn(
          "flex flex-col gap-2",
          !notificationsEnabled && "pointer-events-none opacity-40",
        )}
      >
        <p className="text-xs text-muted-foreground">
          {t("settings.notificationTimes")}
        </p>

        {notificationTimes.map((slot, i) => (
          <TimeSlotRow
            key={`${slot.hour}:${slot.minute}`}
            slot={slot}
            onUpdate={(updated) => handleUpdateTime(i, updated)}
            onRemove={() => handleRemoveTime(i)}
            removeLabel={t("settings.removeTime")}
            toggleLabel={t("settings.toggleTime")}
          />
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={handleAddTime}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("settings.addTime")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier que TypeScript compile**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

---

### Task 5 : Panel Données (cards + chips)

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1 : Ajouter le panel Données juste après la fermeture du panel Notifications**

```tsx
{
  /* ── Panel : Données ── */
}
{
  activeTab === "data" && (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Card Export */}
        <div className="flex-1 rounded-lg border border-input p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("data.exportSection")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["activeTasks", "data.activeTasks"],
                ["completedTasks", "data.completedTasks"],
                ["archivedTasks", "data.archivedTasks"],
                ["projects", "data.exportProjects"],
                ["tags", "data.exportTags"],
              ] as [
                Extract<
                  keyof ExportOptions,
                  | "activeTasks"
                  | "completedTasks"
                  | "archivedTasks"
                  | "projects"
                  | "tags"
                >,
                (
                  | "data.activeTasks"
                  | "data.completedTasks"
                  | "data.archivedTasks"
                  | "data.exportProjects"
                  | "data.exportTags"
                ),
              ][]
            ).map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  exportOptions[key]
                    ? "border-primary text-primary"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <MultiSelect
            options={[
              { value: INBOX_PROJECT_ID, label: t("nav.inbox") },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={exportOptions.projectIds ?? null}
            onChange={(value) =>
              setExportOptions((prev) => ({ ...prev, projectIds: value }))
            }
            allLabel={t("data.allProjects")}
            itemsLabel={t("data.exportProjects")}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-auto"
            onClick={handleExport}
          >
            {t("data.export")}
          </Button>
        </div>

        {/* Card Import */}
        <div className="flex-1 rounded-lg border border-input p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("data.importSection")}
          </p>
          <p className="text-sm text-muted-foreground flex-1">
            {t("data.importDescription")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-auto"
            onClick={handleImportPick}
          >
            {t("data.import")}
          </Button>
        </div>
      </div>

      {dataError && <p className="text-xs text-destructive">{dataError}</p>}
    </div>
  );
}
```

- [ ] **Step 2 : Supprimer les imports inutilisés**

`Checkbox` n'est plus utilisé dans le panel Données (chips à la place). Vérifier qu'il est toujours utilisé dans le panel Notifications (`handleToggleEnabled`) — oui, il l'est. Pas de suppression nécessaire.

- [ ] **Step 3 : Vérifier que TypeScript compile sans erreur**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Résultat attendu : aucune erreur.

- [ ] **Step 4 : Lancer le serveur de dev et vérifier visuellement**

```bash
pnpm dev
```

Vérifier :

1. Les 3 onglets s'affichent et sont cliquables
2. Onglet Général : Apparence + Langue à gauche, Vues Sidebar + Raccourcis à droite
3. Onglet Notifications : section notifications seule, fonctionnelle
4. Onglet Données : deux cards côte à côte en large, empilées en étroit ; chips cliquables ; MultiSelect projet ; bouton Export pleine largeur ; bouton Import pleine largeur ; flux d'import déclenche bien `ImportConfirmDialog`
5. Chips d'export : toggle visuel primaire/muted au clic
