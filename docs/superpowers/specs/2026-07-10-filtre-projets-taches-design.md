# Filtre multi-select projets dans les listes de tâches

**Date** : 2026-07-10
**Statut** : validé (design)

## Objectif

Permettre de filtrer les tâches par un ou plusieurs projets dans les vues
« Toutes les tâches » et « Aujourd'hui », via un select multiple. L'Inbox
(tâches sans projet) est une valeur sélectionnable au même titre qu'un projet.

## Portée

- **Vues concernées** : uniquement « Toutes les tâches »
  (`selectedProjectId === undefined`) et « Aujourd'hui » (`selectedProjectId === "today"`).
- **Hors périmètre** : vues projet unique, Inbox, tags, calendrier — le filtre
  n'y est pas affiché.
- Le filtre est **réinitialisé** au changement de vue (comportement actuel de
  tous les filtres via `setSelectedProject` qui vide `activeFilters`). Aucun
  traitement particulier de persistance.

## Modèle de données

`TaskFilters` (`src/types/index.ts`) gagne un champ optionnel :

```ts
projectIds?: string[]
```

En miroir de `tagIds`. La valeur sentinelle `INBOX_PROJECT_ID` (`"__inbox__"`,
définie dans `src/lib/dataTransfer.ts`) représente « aucun projet » (Inbox),
car `null` n'est pas une valeur d'array valide.

Sémantique :

- `projectIds` absent / `undefined` → aucun filtre projet (tous).
- tableau non vide → tâches dont `project_id` est dans les ids réels,
  **OU** `project_id IS NULL` si `INBOX_PROJECT_ID` fait partie de la sélection.

## Requête SQL

`getTasks(filters)` (`src/db/sqlite-repository.ts`, ~ligne 381) : ajouter la
gestion de `projectIds`, calquée sur le bloc `tagIds` (`IN (...)`).

- Séparer les ids réels de la sentinelle `INBOX_PROJECT_ID`.
- Construire une condition :
  - ids réels présents → `t.project_id IN (?, ?, …)`
  - Inbox sélectionné → `t.project_id IS NULL`
  - les deux → `(t.project_id IN (…) OR t.project_id IS NULL)`
- Cette condition n'entre pas en conflit avec le filtre `projectId` existant :
  dans les vues « Toutes » et « Aujourd'hui », `projectId` vaut respectivement
  `undefined` et n'est pas passé (voir effet `TaskList`), donc seule
  `projectIds` s'applique.

## UI

`FilterBar` (`src/components/tasks/FilterBar.tsx`) : ajouter un composant
`<MultiSelect>` de projets, en copiant le pattern déjà en place dans
`SettingsDialog.tsx` (~ligne 931) :

```tsx
<MultiSelect
  options={[
    { value: INBOX_PROJECT_ID, label: t("nav.inbox") },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]}
  value={activeFilters.projectIds ?? null}
  onChange={(value) => setFilters({ projectIds: value ?? undefined })}
  allLabel={t("filter.allProjects")}
  itemsLabel={t("filter.projects")}
/>
```

Rendu **conditionnel** : affiché uniquement si `selectedProjectId` vaut
`undefined` ou `"today"`. `FilterBar` a accès à `selectedProjectId` via
`useUIStore` (ou le reçoit en prop selon ce qui existe déjà — à vérifier à
l'implémentation).

## Câblage

Aucun changement nécessaire : l'effet de `TaskList` (~ligne 426) propage déjà
`...activeFilters` vers `loadTasks` → `repo.getTasks`. `projectIds` circule
automatiquement. Le bouton « reset » existant efface déjà tout `activeFilters`.

## i18n

Ajouter dans `src/i18n/locales/en.ts` et `fr.ts`, sous la clé `filter` :

- `filter.projects` — label / itemsLabel du multi-select
- `filter.allProjects` — allLabel (peut réutiliser la formulation de
  `data.allProjects` déjà existante)

## Composants réutilisés

- `MultiSelect` (`src/components/ui/multi-select.tsx`) — inchangé.
- `INBOX_PROJECT_ID` (`src/lib/dataTransfer.ts`).
- `useProjectStore` — `projects` est déjà consommé par `TaskList`.

## Tests / vérification

- Vérifier manuellement : sélection d'un projet, de plusieurs, d'Inbox seul,
  d'Inbox + projets, puis reset.
- Vérifier que le filtre n'apparaît que dans « Toutes » et « Aujourd'hui ».
- Vérifier que le changement de vue réinitialise bien la sélection.
