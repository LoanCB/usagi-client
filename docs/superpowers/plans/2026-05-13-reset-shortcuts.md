# Reset Shortcuts Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton "Réinitialiser" dans le header de la section Raccourcis des paramètres, qui remet les trois raccourcis de tri à leurs valeurs par défaut (`⌘S`, `⌘D`, `⌘P`) et persiste le changement.

**Architecture:** On ajoute une action `resetShortcuts` au store Zustand existant (`store/shortcuts.ts`) qui applique `DEFAULT_SHORTCUTS` et persiste via `repo.setSetting`. Le bouton est placé dans le header de la section Raccourcis de `SettingsDialog.tsx`, en `flex justify-between` avec l'icône `RotateCcw`.

**Tech Stack:** React, Zustand, Tailwind CSS, lucide-react, i18next, Vitest

---

### Task 1 : Action `resetShortcuts` dans le store

**Files:**
- Modify: `src/store/shortcuts.ts`
- Modify: `src/store/shortcuts.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter ce bloc à la fin de `src/store/shortcuts.test.ts` :

```typescript
describe("resetShortcuts", () => {
  it("restores all shortcuts to defaults and calls setSetting", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useShortcutsStore());

    // D'abord, modifier un raccourci pour s'éloigner des défauts
    const custom: SortShortcut = { key: "x", meta: false, ctrl: true, alt: false, shift: false };
    await act(() => result.current.setShortcut(repo, "sortUrgency", custom));
    expect(result.current.sortUrgency).toEqual(custom);

    // Puis reset
    await act(() => result.current.resetShortcuts(repo));

    expect(result.current.sortUrgency).toEqual(DEFAULT_SHORTCUTS.sortUrgency);
    expect(result.current.sortDueDate).toEqual(DEFAULT_SHORTCUTS.sortDueDate);
    expect(result.current.sortProject).toEqual(DEFAULT_SHORTCUTS.sortProject);
    expect(repo.setSetting).toHaveBeenLastCalledWith(
      "sort_shortcuts",
      JSON.stringify({
        urgency: DEFAULT_SHORTCUTS.sortUrgency,
        dueDate: DEFAULT_SHORTCUTS.sortDueDate,
        project: DEFAULT_SHORTCUTS.sortProject,
      })
    );
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
pnpm test:run src/store/shortcuts.test.ts
```

Résultat attendu : FAIL avec `result.current.resetShortcuts is not a function`

- [ ] **Step 3 : Implémenter `resetShortcuts` dans le store**

Dans `src/store/shortcuts.ts`, ajouter `resetShortcuts` à l'interface et à l'implémentation :

```typescript
import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import { DEFAULT_SHORTCUTS, type SortShortcut } from "@/lib/shortcuts";

export type ShortcutAction = "sortUrgency" | "sortDueDate" | "sortProject";

interface ShortcutsStore {
  sortUrgency: SortShortcut;
  sortDueDate: SortShortcut;
  sortProject: SortShortcut;
  loadShortcuts(repo: TodoRepository): Promise<void>;
  setShortcut(repo: TodoRepository, action: ShortcutAction, shortcut: SortShortcut): Promise<void>;
  resetShortcuts(repo: TodoRepository): Promise<void>;
}

export const useShortcutsStore = create<ShortcutsStore>((set) => ({
  ...DEFAULT_SHORTCUTS,

  async loadShortcuts(repo) {
    const raw = await repo.getSettings();
    if (!raw["sort_shortcuts"]) return;
    try {
      const parsed = JSON.parse(raw["sort_shortcuts"]) as {
        urgency?: SortShortcut;
        dueDate?: SortShortcut;
        project?: SortShortcut;
      };
      set({
        sortUrgency: parsed.urgency ?? DEFAULT_SHORTCUTS.sortUrgency,
        sortDueDate: parsed.dueDate ?? DEFAULT_SHORTCUTS.sortDueDate,
        sortProject: parsed.project ?? DEFAULT_SHORTCUTS.sortProject,
      });
    } catch {
      // malformed JSON — keep defaults
    }
  },

  async setShortcut(repo, action, shortcut) {
    set({ [action]: shortcut });
    const s = useShortcutsStore.getState();
    await repo.setSetting(
      "sort_shortcuts",
      JSON.stringify({
        urgency: s.sortUrgency,
        dueDate: s.sortDueDate,
        project: s.sortProject,
      })
    );
  },

  async resetShortcuts(repo) {
    set({ ...DEFAULT_SHORTCUTS });
    await repo.setSetting(
      "sort_shortcuts",
      JSON.stringify({
        urgency: DEFAULT_SHORTCUTS.sortUrgency,
        dueDate: DEFAULT_SHORTCUTS.sortDueDate,
        project: DEFAULT_SHORTCUTS.sortProject,
      })
    );
  },
}));
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
pnpm test:run src/store/shortcuts.test.ts
```

Résultat attendu : tous les tests PASS

- [ ] **Step 5 : Commit**

```bash
git add src/store/shortcuts.ts src/store/shortcuts.test.ts
git commit -m "feat: add resetShortcuts action to shortcuts store"
```

---

### Task 2 : Clés i18n

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1 : Ajouter la clé dans `en.ts`**

Dans `src/i18n/locales/en.ts`, trouver la section `settings` (autour de la ligne 106) et ajouter `shortcutsReset` après `shortcutClear` :

```typescript
    shortcutClear: "Clear shortcut",
    shortcutsReset: "Reset to defaults",
```

- [ ] **Step 2 : Ajouter la clé dans `fr.ts`**

Dans `src/i18n/locales/fr.ts`, trouver la section `settings` et ajouter `shortcutsReset` après `shortcutClear` :

```typescript
    shortcutClear: "Effacer le raccourci",
    shortcutsReset: "Réinitialiser",
```

- [ ] **Step 3 : Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/fr.ts
git commit -m "feat: add shortcutsReset i18n key"
```

---

### Task 3 : Bouton reset dans `SettingsDialog.tsx`

**Files:**
- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1 : Ajouter `RotateCcw` aux imports lucide**

Ligne 3 de `src/components/layout/SettingsDialog.tsx`, ajouter `RotateCcw` :

```typescript
import { Trash2, Plus, ChevronUp, ChevronDown, Sun, Moon, Monitor, X, RotateCcw } from "lucide-react";
```

- [ ] **Step 2 : Récupérer `resetShortcuts` depuis le store**

Dans la fonction `SettingsDialog`, après la ligne `const setShortcut = useShortcutsStore((s) => s.setShortcut);`, ajouter :

```typescript
  const resetShortcuts = useShortcutsStore((s) => s.resetShortcuts);
```

- [ ] **Step 3 : Remplacer le header de la section Raccourcis**

Trouver ce bloc (autour de la ligne 405) :

```tsx
            {/* Section: Shortcuts */}
            <div className="flex flex-col gap-3 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("settings.shortcuts")}
              </p>
```

Le remplacer par :

```tsx
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
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
pnpm test:run
```

Résultat attendu : tous les tests PASS

- [ ] **Step 5 : Commit**

```bash
git add src/components/layout/SettingsDialog.tsx
git commit -m "feat: add reset-all shortcuts button in settings"
```
