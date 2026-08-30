# Export — Filtre projet multi-select

**Date :** 2026-05-18

**Objectif :** Permettre à l'utilisateur de filtrer l'export par projet(s) lors de l'export de données depuis le SettingsDialog. Par défaut, toutes les tâches sont exportées ; l'utilisateur peut choisir un ou plusieurs projets spécifiques (y compris l'Inbox).

---

## Architecture

Trois zones modifiées, aucune dépendance nouvelle.

| Action | Fichier                                    | Rôle                                                          |
| ------ | ------------------------------------------ | ------------------------------------------------------------- |
| Modify | `src/lib/dataTransfer.ts`                  | Ajout du filtre projet dans `ExportOptions` et `exportData()` |
| Create | `src/components/ui/multi-select.tsx`       | Composant multi-select réutilisable (Popover + Checkbox)      |
| Modify | `src/components/layout/SettingsDialog.tsx` | Intégration du `MultiSelect` dans la section "Données"        |

---

## Couche données — `dataTransfer.ts`

### Constante sentinelle

```ts
export const INBOX_PROJECT_ID = "__inbox__" as const;
```

L'Inbox correspond aux tâches dont `projectId === null`. Comme `ExportOptions.projectIds` est un tableau de `string`, on utilise cette constante pour représenter l'Inbox dans la sélection.

### ExportOptions

```ts
export interface ExportOptions {
  activeTasks: boolean;
  completedTasks: boolean;
  archivedTasks: boolean;
  projects: boolean;
  tags: boolean;
  projectIds: string[] | null; // null = tous les projets, tableau = filtre actif
}
```

### exportData()

Après avoir constitué le tableau `tasks` (filtrage par type existant), on applique le filtre projet si `projectIds !== null` :

```ts
if (options.projectIds !== null) {
  const projectSet = new Set(options.projectIds);
  tasks = tasks.filter((t) =>
    t.projectId === null
      ? projectSet.has(INBOX_PROJECT_ID)
      : projectSet.has(t.projectId),
  );
}
```

Le filtre projet s'applique **après** le filtre par type, sur le tableau `tasks` déjà constitué.

---

## Composant UI — `src/components/ui/multi-select.tsx`

Composant générique, sans logique métier. Utilise `Popover` (déjà présent) et `Checkbox` (déjà présent).

### Interface

```ts
interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[] | null; // null = "tous" sélectionné
  onChange: (value: string[] | null) => void;
  allLabel: string; // ex: "Tous les projets"
  placeholder?: string; // label du trigger quand rien n'est sélectionné (jamais utilisé ici)
}
```

### Comportement

- **Trigger** : affiche `allLabel` si `value === null` ; sinon `"N projets"` (où N = nombre de projets sélectionnés).
- **Option "Tous"** en tête de liste : cliquer dessus appelle `onChange(null)` et ferme le menu.
- **Options projet** : chaque ligne est une checkbox. Cocher un projet quand `value === null` initialise le tableau avec ce seul projet. Décocher le dernier projet restant repasse à `null` (= "Tous").
- Le popover reste ouvert pendant la sélection multiple ; il se ferme en cliquant en dehors.

### Trigger label (détail)

```
value === null          → allLabel  (ex: "Tous les projets")
value.length === 1      → nom du projet sélectionné
value.length === 2      → "Projet A, Projet B"
value.length >= 3       → "3 projets"
```

---

## Intégration — `SettingsDialog.tsx`

### Chargement des projets

```ts
const projects = useProjectStore((s) => s.projects);
```

### État initial mis à jour

```ts
const [exportOptions, setExportOptions] = useState<ExportOptions>({
  activeTasks: true,
  completedTasks: true,
  archivedTasks: true,
  projects: true,
  tags: true,
  projectIds: null, // nouveau champ
});
```

### Options du MultiSelect

```ts
const projectSelectOptions = [
  { value: INBOX_PROJECT_ID, label: t("nav.inbox") },
  ...projects.map((p) => ({ value: p.id, label: p.name })),
];
```

### JSX — ajouté sous les checkboxes existantes

```tsx
<MultiSelect
  options={projectSelectOptions}
  value={exportOptions.projectIds}
  onChange={(value) =>
    setExportOptions((prev) => ({ ...prev, projectIds: value }))
  }
  allLabel={t("data.allProjects")}
/>
```

### Nouvelles clés i18n

```ts
// en.ts / fr.ts — dans le groupe "data"
allProjects: "All projects" / "Tous les projets";
```

---

## Tests

Fichier : `src/lib/dataTransfer.test.ts`

Nouveaux cas à couvrir :

| Cas                  | `projectIds`          | Résultat attendu                    |
| -------------------- | --------------------- | ----------------------------------- |
| Aucun filtre         | `null`                | toutes les tâches                   |
| Un projet spécifique | `["p1"]`              | uniquement les tâches de `p1`       |
| Inbox uniquement     | `["__inbox__"]`       | uniquement les tâches sans projet   |
| Mix projet + Inbox   | `["p1", "__inbox__"]` | tâches de `p1` + tâches sans projet |
| Tableau vide         | `[]`                  | aucune tâche                        |

Le composant `MultiSelect` n'a pas de test unitaire (logique UI pure, pas de logique métier).

---

## Contraintes

- `MultiSelect` est un composant générique sans import de types métier — réutilisable ailleurs.
- Le filtre projet ne change pas le format JSON exporté (`ExportData`) : il affecte seulement quelles tâches y apparaissent.
- La valeur `projectIds` n'est pas persistée entre les ouvertures du dialog (state local, reset à chaque montage).
