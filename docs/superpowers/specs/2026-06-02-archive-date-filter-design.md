# Archive View — Filtre de date (archivage + échéance)

## Contexte

La vue archive dispose déjà d'une recherche texte et d'un filtre projet. On ajoute un filtre de date permettant de restreindre les tâches archivées par date d'archivage (`deletedAt`) et/ou date d'échéance (`dueDate`), avec presets rapides et plage personnalisée.

## Décisions de design

- **UX** : bouton "Dates ▾" dans le header (même largeur fixe `w-36` que les autres filtres), ouvre un Popover avec deux sections (archivage / échéance)
- **Presets** : "7 derniers jours", "30 jours", "Ce mois" — cliquer un preset actif le désactive
- **Plage ouverte** : `from` seul → `date ≥ from` jusqu'à aujourd'hui ; `to` seul → du début jusqu'à `date ≤ to`
- **Tâche sans `dueDate`** : exclue quand un filtre d'échéance est actif
- **Calendrier** : `react-day-picker` `mode="range"`, locale française via `i18n.language`
- **Filtrage** : 100 % local dans `ArchiveView`, aucun changement au store ou repo

## Architecture

### Fichiers

| Action | Fichier                                       | Rôle                                                           |
| ------ | --------------------------------------------- | -------------------------------------------------------------- |
| Create | `src/components/layout/ArchiveDateFilter.tsx` | Composant Popover complet (presets + calendrier range)         |
| Modify | `src/components/layout/ArchiveView.tsx`       | Ajouter état + filtrage + `<ArchiveDateFilter>` dans le header |
| Modify | `src/i18n/locales/en.ts`                      | 5 nouvelles clés `archive.*`                                   |
| Modify | `src/i18n/locales/fr.ts`                      | 5 nouvelles clés `archive.*`                                   |

### Type partagé

```ts
// Défini dans ArchiveDateFilter.tsx, exporté
export type DateRange = { from: string | null; to: string | null };
```

### État ajouté dans `ArchiveView`

```ts
const [archivedDateRange, setArchivedDateRange] = useState<DateRange>({
  from: null,
  to: null,
});
const [dueDateRange, setDueDateRange] = useState<DateRange>({
  from: null,
  to: null,
});
```

### Logique de filtrage (`filteredTasks`)

```ts
const today = todayIso();

const inRange = (date: string | null, range: DateRange): boolean => {
  if (!range.from && !range.to) return true;
  if (!date) return false;
  const from = range.from ?? "0000-01-01";
  const to = range.to ?? today;
  return date >= from && date <= to;
};

// Dans le filtre :
const archivedDate = task.deletedAt?.slice(0, 10) ?? null;
const matchesArchivedDate = inRange(archivedDate, archivedDateRange);
const matchesDueDate = inRange(task.dueDate, dueDateRange);
```

## Composant `ArchiveDateFilter`

### Props

```ts
interface ArchiveDateFilterProps {
  archivedRange: DateRange;
  onArchivedRangeChange: (range: DateRange) => void;
  dueDateRange: DateRange;
  onDueDateRangeChange: (range: DateRange) => void;
}
```

### Trigger

- Style identique à `CalendarProjectFilter` : `w-36 h-7 px-2.5 text-xs border gap-1.5`
- Inactif (aucun filtre) : `border-border/40 text-muted-foreground`, texte `t("archive.filterDates")`
- Actif (N sections actives) : couleur primaire, texte `"Dates · N"`

### Structure du popover

```
PopoverContent (w-72)
  ├── Section "Date d'archivage"
  │     ├── Label : t("archive.filterArchivedDate")
  │     ├── Chips presets : 7j / 30j / Ce mois
  │     └── Champs début → fin (chacun ouvre un Calendar mode="range")
  ├── <hr>
  ├── Section "Date d'échéance"
  │     ├── Label : t("dueDate.label")
  │     ├── Chips presets : 7j / 30j / Ce mois
  │     └── Champs début → fin
  ├── <hr>
  └── Bouton "Réinitialiser" : t("filter.reset") — visible seulement si un filtre est actif
```

### Presets

Calculés à la date d'ouverture du popover (pas besoin de `useMemo`) :

| Preset           | `from`                       | `to`    |
| ---------------- | ---------------------------- | ------- |
| 7 derniers jours | `today - 7j`                 | `today` |
| 30 jours         | `today - 30j`                | `today` |
| Ce mois          | premier jour du mois courant | `today` |

Cliquer un preset actif → remet `{ from: null, to: null }` pour cette section.

Un preset est "actif" si `range.from === preset.from && range.to === preset.to`.

### Calendrier range (inline)

Chaque section affiche un `Calendar mode="range"` **directement dans le popover** (pas de Popover imbriqué — évite les conflits de focus avec base-ui). Le calendrier react-day-picker gère la sélection début→fin en une seule interaction continue.

Au-dessus du calendrier, deux labels affichent les dates sélectionnées :

```
[ 25 mai 2026 ]  →  [ 31 mai 2026 ]
```

Si non définies : placeholder "Début…" / "Fin…" en `text-muted-foreground`.

Quand la sélection change (`onSelect`), mettre à jour `from` et `to` de la section concernée. Le type react-day-picker pour le range est `{ from: Date | undefined; to: Date | undefined }` — convertir vers `string | null` (ISO `YYYY-MM-DD`) à la sélection.

Le popover a une largeur `w-auto` pour s'adapter à la largeur du calendrier (~280px).

## i18n

### Nouvelles clés (section `archive`)

| Clé                          | EN                | FR                   |
| ---------------------------- | ----------------- | -------------------- |
| `archive.filterDates`        | `"Dates"`         | `"Dates"`            |
| `archive.filterArchivedDate` | `"Archived date"` | `"Date d'archivage"` |
| `archive.preset7d`           | `"Last 7 days"`   | `"7 derniers jours"` |
| `archive.preset30d`          | `"Last 30 days"`  | `"30 jours"`         |
| `archive.presetMonth`        | `"This month"`    | `"Ce mois"`          |

### Clés réutilisées

- `dueDate.label` → titre section échéance
- `filter.reset` → bouton réinitialiser

## Hors scope

- Filtre de date sur d'autres vues (TaskList, Calendar)
- Persistance des filtres entre navigations
- Filtre sur `createdAt`
- Preset "personnalisé" avec saisie clavier directe
