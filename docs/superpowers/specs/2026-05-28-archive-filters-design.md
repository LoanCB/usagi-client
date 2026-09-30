# Archive View — Filtres projet + recherche texte

## Contexte

La vue archive (`ArchiveView.tsx`) affiche toutes les tâches archivées sans possibilité de filtrage. L'objectif est d'ajouter une toolbar dans le header permettant de filtrer par projet et par titre.

## Décisions de design

- **Placement** : toolbar dans le header, à droite du titre (option C choisie)
- **Scope** : filtre projet (single-select) + recherche texte
- **Stratégie de filtrage** : côté composant uniquement, état local — aucun changement au store ou au repo

## Architecture

### Fichier modifié

Un seul fichier : `src/components/layout/ArchiveView.tsx`

### État local ajouté

```ts
const [search, setSearch] = useState("");
const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
```

### Données calculées (useMemo)

```ts
// Projets ayant au moins une tâche archivée
const availableProjects = useMemo(() => {
  const ids = new Set(archivedTasks.map((t) => t.projectId).filter(Boolean));
  return projects.filter((p) => ids.has(p.id));
}, [archivedTasks, projects]);

// Tâches après application des deux filtres
const filteredTasks = useMemo(() => {
  return archivedTasks.filter((task) => {
    const matchesSearch =
      !search.trim() || task.title.toLowerCase().includes(search.toLowerCase());
    const matchesProject =
      filterProjectId === null || task.projectId === filterProjectId;
    return matchesSearch && matchesProject;
  });
}, [archivedTasks, search, filterProjectId]);
```

## Layout

```
┌─────────────────────────────────────────────────────┐
│ Archives          [🔍 Rechercher…  ×]  [Projet ▾]   │
├─────────────────────────────────────────────────────┤
│  Tâche archivée 1       Projet A · 23 mai    ↩ 🗑   │
│  Tâche archivée 2       Projet B · 20 mai    ↩ 🗑   │
│  …                                                  │
└─────────────────────────────────────────────────────┘
```

## Composants réutilisés

| Élément            | Composant                              | Style                                 |
| ------------------ | -------------------------------------- | ------------------------------------- |
| Champ de recherche | `<input>` natif                        | `glass-stat` (identique à `TaskList`) |
| Bouton clear (×)   | `<button>` + icône `X`                 | Identique à `TaskList`                |
| Filtre projet      | `<Select>` de `@/components/ui/select` | Existant                              |

Le select projet est masqué si `availableProjects` est vide (toutes les tâches archivées sont sans projet).

## États vides

| Situation                            | Message affiché               |
| ------------------------------------ | ----------------------------- |
| Aucune tâche archivée                | `archive.empty` (existant)    |
| Tâches archivées mais aucun résultat | `archive.noResults` (nouveau) |

## i18n

### Nouvelle clé (les deux fichiers)

```ts
archive: {
  // clés existantes...
  noResults: "No tasks match your filters",  // en
  noResults: "Aucune tâche ne correspond aux filtres",  // fr
}
```

### Clés réutilisées (sans ajout)

- `task.search` → placeholder du champ de recherche
- `calendar.filter.allProjects` → option "Tous les projets" du select

## Hors scope

- Multi-select projets
- Persistance du filtre entre navigations
- Filtrage côté Rust/SQLite
- Autres types de filtres (date, tags)
