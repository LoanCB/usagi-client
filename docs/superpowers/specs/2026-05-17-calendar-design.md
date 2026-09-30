# Calendar View — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

## Overview

Ajouter une vue "Calendrier" à la sidebar, sous l'entrée "Tags", permettant de visualiser les tâches par leur `dueDate` (tâches à réaliser) et leur `completedAt` (tâches réalisées). La vue propose un toggle Mois / Semaine et permet de créer des tâches directement depuis un jour du calendrier.

---

## Architecture & fichiers

### Nouveaux fichiers

```
src/components/calendar/
  CalendarView.tsx       — container principal : charge les données, gère viewMode + currentDate
  CalendarHeader.tsx     — navigation prev/next + toggle Mois/Semaine
  MonthView.tsx          — grille mensuelle (7 colonnes × 5-6 semaines)
  WeekView.tsx           — vue hebdomadaire (7 colonnes, une par jour)
src/lib/calendarUtils.ts       — fonction pure de groupement des tâches par date
src/lib/calendarUtils.test.ts  — tests unitaires du groupement
tests/e2e/calendar.spec.ts     — tests E2E de la vue calendrier
```

### Fichiers modifiés

| Fichier                                 | Modification                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `src/store/ui.ts`                       | Commentaire : `"calendar"` ajouté aux sentinels valides de `selectedProjectId` |
| `src/components/layout/Sidebar.tsx`     | NavItem "Calendrier" ajouté sous "Tags" dans la section Views                  |
| `src/components/layout/AppShell.tsx`    | Rend `<CalendarView />` si `selectedProjectId === "calendar"`                  |
| `src/components/tasks/QuickAddTask.tsx` | Nouvelle prop optionnelle `dueDate?: string \| null`                           |
| `src/types/index.ts`                    | `TaskFilters` : ajout de `allTasks?: boolean`                                  |
| `src/db/sqlite-repository.ts`           | `getTasks()` : omet le filtre `completed_at` quand `allTasks: true`            |
| `src/i18n/locales/fr.ts`                | `nav.calendar: "Calendrier"`                                                   |
| `src/i18n/locales/en.ts`                | `nav.calendar: "Calendar"`                                                     |

---

## Intégration dans la sidebar

Le sentinel `"calendar"` s'ajoute aux sentinels existants de `selectedProjectId` (`"today"`, `"tags"`, `undefined` pour all tasks, `null` pour Inbox, UUIDs pour les projets). Aucune modification de la structure du store n'est nécessaire.

Le NavItem Calendrier utilise l'icône `CalendarDays` de lucide-react et s'insère entre "Tags" et le séparateur Projects dans la sidebar.

---

## Data & groupement

### Chargement

`CalendarView` appelle `repo.getTasks({ allTasks: true })` au mount et à chaque navigation de mois/semaine. Le flag `allTasks: true` dans `TaskFilters` indique au repository de ne pas appliquer le filtre `completed_at` habituel, retournant ainsi toutes les tâches (pendantes et complétées).

### Logique de groupement

Fonction pure : `groupTasksByDate(tasks: Task[]): Map<string, { due: Task[], completed: Task[] }>`

La clé de la Map est une date ISO (`"2026-05-17"`).

Règles :

- **Tâche pendante** (`completedAt === null`) avec `dueDate` → entre dans `due` à sa `dueDate`
- **Tâche complétée** (`completedAt !== null`) → entre dans `completed` à la date extraite de son `completedAt` (partie date uniquement, heure ignorée)
- **Tâche sans `dueDate` et non complétée** → absente du calendrier

Une tâche complétée n'apparaît qu'à sa date `completedAt`. Si elle avait une `dueDate` différente, seule la date de complétion est affichée.

### Représentation visuelle

- Tâches `due` : indicateur rouge/orange
- Tâches `completed` : indicateur vert
- Jour courant : mise en valeur (fond bleu)

---

## Interactions

### Clic sur une tâche

```ts
setSelectedProject(task.projectId ?? undefined);
setSelectedTask(task.id);
```

Navigation immédiate vers la liste du projet de la tâche (ou "Toutes les tâches" si pas de projet) avec le panneau TaskDetail ouvert. Quitte la vue calendrier.

### Clic sur un jour vide

`CalendarView` maintient un state `selectedDay: string | null`. Un clic sur une cellule de jour positionne `selectedDay` à la date ISO correspondante et affiche un `QuickAddTask` inline avec `dueDate` pré-rempli.

Après création de la tâche, `selectedDay` repasse à `null` et la tâche apparaît immédiatement dans le calendrier via le store.

### Extension de QuickAddTask

Nouvelle prop optionnelle `dueDate?: string | null`. Quand fournie, elle est passée à `createTask` dans `CreateTaskInput`. Le comportement existant (sans `dueDate`) est inchangé.

### Toggle Mois / Semaine

State local `viewMode: 'month' | 'week'` dans `CalendarView`. La vue démarre toujours en mode mensuel. Pas de persistance inter-sessions dans cette version.

---

## Tests

### Unitaires — `src/lib/calendarUtils.test.ts`

- Tâche pendante avec `dueDate` → présente dans `due` à la bonne date
- Tâche complétée → présente dans `completed` à la date de `completedAt`, absente de `due`
- Tâche sans `dueDate` non complétée → absente du résultat
- Plusieurs tâches le même jour → toutes présentes dans la bonne catégorie
- `completedAt` avec heure → date extraite correctement (partie date uniquement)

### E2E — `tests/e2e/calendar.spec.ts`

- Naviguer vers la vue Calendrier via la sidebar
- Une tâche avec `dueDate` apparaît sur le bon jour du calendrier
- Une tâche complétée apparaît sur son jour de complétion
- Cliquer sur un jour vide → QuickAddTask s'affiche avec la date pré-remplie
- Créer une tâche depuis le calendrier → elle apparaît dans le calendrier
- Cliquer sur une tâche dans le calendrier → navigation vers la liste + TaskDetail ouvert

---

## i18n

```ts
// fr.ts
nav: {
  calendar: "Calendrier";
}

// en.ts
nav: {
  calendar: "Calendar";
}
```
