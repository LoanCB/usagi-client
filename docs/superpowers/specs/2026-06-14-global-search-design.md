# Global Search — Design Spec

**Date:** 2026-06-14  
**Status:** Approved  

---

## Overview

Ajout d'une palette de recherche globale accessible via CTRL+K (⌘K sur macOS) permettant de rechercher et naviguer vers des tâches, projets et tags depuis n'importe quel état de l'application.

---

## Scope

### Ce qui est inclus
- Recherche de tâches (actives, complétées, archivées) par titre
- Recherche de projets par nom
- Recherche de tags par nom
- Navigation vers le résultat sélectionné (Entrée)
- Actions rapides au clavier sur une tâche sélectionnée (Tab) : compléter, archiver
- Raccourci CTRL+K / ⌘K pour ouvrir, ESC pour fermer
- Support i18n FR/EN

### Ce qui est exclu
- Recherche dans les descriptions de tâches
- Commandes d'actions statiques (pas de "Nouvelle tâche", "Aller dans Inbox"…)
- Résultats triés par pertinence / fuzzy search — filtrage simple par `includes()` (suffisant pour une app locale)
- Persistance de l'historique de recherche

---

## Librairie

**cmdk v1** — headless command palette pour React.  
- Zéro dépendance externe (hors React)
- Fournit : filtrage, navigation clavier (flèches, Entrée, Escape), ARIA accessibility
- Stylisation 100% via Tailwind (pas de styles imposés)

---

## UI & Comportement

### Ouverture / fermeture
- CTRL+K (Windows/Linux) ou ⌘K (macOS) — détection via `isMac()` de `src/lib/utils.ts`
- ESC ferme la palette
- Clic sur l'overlay ferme la palette
- La palette se ferme automatiquement après navigation

### Layout
- Overlay sombre avec `backdrop-blur` sur toute la fenêtre
- Palette centrée horizontalement, positionnée à ~20% du haut de l'écran
- Largeur max : 580px

### Structure de la palette
```
┌─────────────────────────────────────┐
│ 🔍 Rechercher…                  ESC │
├─────────────────────────────────────┤
│ TÂCHES                              │
│  ○  Refactor task creation flow   ↵ ⇥│  ← item actif
│  ✓  Write API docs (complétée)      │  ← titre barré
│  ○  Task sorting (archivée)         │
├─────────────────────────────────────┤
│ PROJETS                             │
│  📋 Task Manager v2                 │
├─────────────────────────────────────┤
│ TAGS                                │
│  ● task-tracking                    │
├─────────────────────────────────────┤
│ ↑↓ Naviguer  ↵ Ouvrir  ⇥ Actions   │
└─────────────────────────────────────┘
```

### Résultats
- **Tâches** : max 5 résultats — icône cercle (active) ou check (complétée), titre, métadonnées (projet + priorité), badges "complétée" / "archivée"
- **Projets** : max 3 résultats — icône emoji du projet, nom, nombre de tâches actives
- **Tags** : max 3 résultats — point coloré, nom
- Groupes masqués si aucun résultat
- Filtre en temps réel via `includes()` case-insensitive sur le query

### Item actif (keyboard focus)
- Barre verticale violette à gauche
- Actions rapides visibles à droite : `↵ Ouvrir` / `⇥ Actions`

### Actions rapides (Tab sur une tâche)
- La palette passe en mode "actions" : l'item sélectionné est affiché dans l'input, liste des actions disponibles
- Actions tâche : "Marquer comme complétée" / "Marquer comme active" (toggle), "Archiver"
- ESC revient à la recherche

### Navigation
- `↑` / `↓` : naviguer entre les résultats (traverse les groupes)
- `↵` : naviguer vers le résultat (ouvrir tâche, filtrer par projet/tag)
- `⇥` : actions rapides (tâches uniquement)
- `ESC` : fermer (ou revenir à la recherche si en mode actions)

---

## Architecture

### Nouveaux fichiers

#### `src/store/search.ts`
Store Zustand minimal :
```ts
interface SearchStore {
  isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
}
```

#### `src/components/layout/GlobalSearch.tsx`
Composant principal. Structure :
- `Command` (cmdk) wrappé dans le Dialog de `@base-ui/react`
- `Command.Input` pour le champ de recherche
- `Command.List` avec trois `Command.Group` (Tâches, Projets, Tags)
- `Command.Item` pour chaque résultat
- Mode actions rapides : état local `quickActionTarget: Task | null`
- Filtrage via `useMemo` sur les stores existants (aucune requête SQLite)

### Fichiers modifiés

#### `src/components/layout/AppShell.tsx`
- Montage de `<GlobalSearch />` dans le JSX
- `useEffect` global sur `document` pour écouter CTRL+K / ⌘K et appeler `toggle()`

#### `src/i18n/locales/fr.ts` et `en.ts`
Nouvelles clés sous `search` :
```ts
search: {
  placeholder: "Rechercher tâches, projets, tags…",
  tasks: "Tâches",
  projects: "Projets",
  tags: "Tags",
  noResults: "Aucun résultat",
  open: "Ouvrir",
  quickActions: "Actions",
  complete: "Marquer comme complétée",
  uncomplete: "Marquer comme active",
  archive: "Archiver",
  completed: "complétée",
  archived: "archivée",
}
```

---

## Data Flow

```
CTRL+K
  → useSearchStore.toggle()
  → GlobalSearch dialog s'ouvre

Saisie utilisateur
  → cmdk filtre en interne (Command.Input value)
  → useMemo filtre tasks/projects/tags depuis les stores Zustand
  → Résultats rendus dans Command.List

↵ sur une tâche
  → useUIStore.navigateToTask(task.projectId, task.id)
  → GlobalSearch se ferme

↵ sur un projet
  → useUIStore.setSelectedProject(project.id)
  → GlobalSearch se ferme

↵ sur un tag
  → useUIStore.setSelectedProject("tags")
  → (future amélioration : filtre par tagId)
  → GlobalSearch se ferme

⇥ sur une tâche
  → setQuickActionTarget(task) — état local
  → Affichage des actions rapides

↵ sur "Compléter"
  → useTaskStore.completeTask(repo, task.id)
  → GlobalSearch se ferme
```

---

## i18n

Toutes les chaînes passent par `useTranslation()`. Les clés sont ajoutées dans `fr.ts` et `en.ts`.

---

## Limites & décisions

| Décision | Raison |
|---|---|
| Filtrage `includes()` plutôt que fuzzy | App locale avec peu de données — pas besoin de fuzzy search |
| Tâches archivées incluses | Demande explicite utilisateur |
| Max 5 tâches / 3 projets / 3 tags | Évite de surcharger visuellement la palette |
| Pas de persistance historique | YAGNI — hors scope |
| Store séparé pour `isOpen` | Permet d'ouvrir la palette depuis n'importe où sans prop drilling |
