# Calendar View — Améliorations v2

**Date :** 2026-05-17
**Contexte :** La vue calendrier (MonthView / WeekView) est déjà implémentée. Ce document spécifie 5 améliorations UX demandées par l'utilisateur.

---

## 1 — Tooltip au hover dans la vue Semaine

### Problème
Dans `WeekView`, les tâches sont affichées sous forme de chips avec texte tronqué (`truncate`). Contrairement à `MonthView` qui a déjà `title={task.title}` sur ses boutons, `WeekView` n'expose pas le titre complet au hover.

### Solution
Ajouter `title={task.title}` aux boutons de tâches (due et completed) dans `WeekView.tsx`.

**Fichier modifié :** `src/components/calendar/WeekView.tsx`

---

## 2 — Fix : clic sur tâche complétée passée n'ouvre pas le détail

### Problème
`handleTaskClick` dans `CalendarView` appelle `setSelectedProject(task.projectId)` puis `setSelectedTask(task.id)`. Cela déclenche :
1. Une navigation hors de la vue calendrier vers la liste de tâches du projet.
2. Un rechargement des tâches avec les filtres par défaut (excluant les tâches complétées avant aujourd'hui).
3. La tâche disparaît du store → `TaskDetail` ne peut pas l'afficher.

De plus, `AppShell` a `selectedProjectId !== "calendar"` dans la condition `showDetail`, ce qui empêchait de toute façon l'affichage du panneau depuis le calendrier.

### Solution
- **`CalendarView.handleTaskClick`** : appeler uniquement `setSelectedTask(task.id)` — supprimer l'appel à `setSelectedProject`.
- **`AppShell`** : retirer `selectedProjectId !== "calendar"` de la condition `showDetail`.
- Résultat : le `TaskDetail` s'affiche à droite du calendrier sans quitter la vue. Les tâches chargées par `loadTasks({ allTasks: true })` restent dans le store.

**Fichiers modifiés :** `src/components/calendar/CalendarView.tsx`, `src/components/layout/AppShell.tsx`

---

## 3 — Clic droit pour créer une tâche

### Comportement
Chaque case de jour dans `MonthView` et `WeekView` est enveloppée dans un `ContextMenu` / `ContextMenuTrigger` (composant déjà disponible dans `src/components/ui/context-menu.tsx`, basé sur `@base-ui/react/context-menu`).

Le menu contient un seul item : **"Nouvelle tâche pour ce jour"** (`calendar.newTask`).

**Action** : appelle `onDayClick(iso)` — même callback que le clic gauche — pour ouvrir le `DayDetailPanel` et y placer le focus sur l'input `QuickAddTask`. La prop `onDayClick` existe déjà, pas de nouveau callback.

**Fichiers modifiés :** `src/components/calendar/MonthView.tsx`, `src/components/calendar/WeekView.tsx`

---

## 4 — Clic gauche : panneau de détail du jour (latéral droit)

### Comportement
Au clic gauche sur une case, un `DayDetailPanel` s'ouvre à droite de la grille calendrier. Même pattern resize que `TaskDetail` dans `AppShell`.

### Composant `DayDetailPanel`

**Props :**
```ts
interface DayDetailPanelProps {
  day: string;                              // ISO date "yyyy-MM-dd"
  entry: { due: Task[]; completed: Task[] } | undefined;  // grouped.get(day)
  width: number;
  onClose: () => void;
  onTaskClick: (task: Task) => void;
}
```

**Contenu :**
- Header : date formatée (ex. "samedi 17 mai 2026") + bouton fermer (×)
- Liste des tâches du jour :
  - Tâches `due` : texte orange, cliquables → `onTaskClick`
  - Tâches `completed` : texte vert, barré, cliquables → `onTaskClick`
  - Si aucune tâche : message `calendar.noTasks`
- `QuickAddTask` en bas avec `dueDate={day}`

### Layout dans `CalendarView`
```tsx
<div className="flex flex-1 overflow-hidden">
  <div className="flex flex-col flex-1 overflow-hidden">
    {/* MonthView ou WeekView */}
  </div>
  {selectedDay && (
    <>
      <ResizeHandle
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        isDragging={isDragging}
      />
      <DayDetailPanel
        day={selectedDay}
        grouped={grouped}
        width={width}
        onClose={() => setSelectedDay(null)}
        onTaskClick={handleTaskClick}
      />
    </>
  )}
</div>
```

### Resize
`useResizable` avec :
- `storageKey="calendar-day-panel-width"`
- `defaultWidth=280`
- `minWidth=200`
- `maxWidth=480`

Double-clic sur `ResizeHandle` remet la largeur à `defaultWidth`.

**Fichiers créés/modifiés :** `src/components/calendar/DayDetailPanel.tsx` (nouveau), `src/components/calendar/CalendarView.tsx`

---

## 5 — Date picker dans le header

### Comportement
Le label de date dans `CalendarHeader` (ex. "mai 2026" ou "12 mai – 18 mai 2026") devient un bouton déclenchant un `Popover`. Le `PopoverContent` contient le composant `Calendar` (react-day-picker, déjà disponible dans `src/components/ui/calendar.tsx`) configuré avec :
- `captionLayout="dropdown"` : dropdowns mois + année pour navigation rapide
- `mode="single"`
- `selected={currentDate}`
- `onSelect={(d) => { if (d) { onDateChange(d); close(); } }}`

Sélectionner une date :
1. Appelle `onDateChange(date)` → `setCurrentDate(date)` dans `CalendarView`
2. Ferme le popover
3. En vue semaine : navigue à la semaine contenant la date choisie

### Nouvelle prop `CalendarHeader`
```ts
onDateChange: (date: Date) => void;
```

Le popover est contrôlé (`open` / `onOpenChange`) pour pouvoir se fermer après sélection.

**Fichiers modifiés :** `src/components/calendar/CalendarHeader.tsx`, `src/components/calendar/CalendarView.tsx`

---

## i18n

Nouvelles clés à ajouter dans `en.ts` et `fr.ts` sous la section `calendar` :

| Clé | EN | FR |
|---|---|---|
| `calendar.noTasks` | "No tasks for this day" | "Aucune tâche pour ce jour" |
| `calendar.newTask` | "New task for this day" | "Nouvelle tâche pour ce jour" |
| `calendar.closeDay` | "Close day detail" | "Fermer le détail du jour" |

---

## Plan de fichiers

| Fichier | Modification |
|---|---|
| `src/components/calendar/DayDetailPanel.tsx` | Nouveau composant |
| `src/components/calendar/CalendarView.tsx` | `useResizable`, layout flex, `handleTaskClick` simplifié, `onDateChange` |
| `src/components/calendar/CalendarHeader.tsx` | Popover + Calendar picker, prop `onDateChange` |
| `src/components/calendar/WeekView.tsx` | `title` sur boutons + `ContextMenu` par case |
| `src/components/calendar/MonthView.tsx` | `ContextMenu` par case |
| `src/components/layout/AppShell.tsx` | Retirer `selectedProjectId !== "calendar"` de `showDetail` |
| `src/i18n/locales/en.ts` | 3 nouvelles clés `calendar.*` |
| `src/i18n/locales/fr.ts` | 3 nouvelles clés `calendar.*` |

---

## Points d'attention

- **Focus sur QuickAddTask** : quand le `DayDetailPanel` s'ouvre via clic droit ("Nouvelle tâche"), le focus doit être placé sur l'input. `QuickAddTask` devra exposer une prop `autoFocus` ou un `ref` impératif. À évaluer lors de l'implémentation.
- **Cohabitation `DayDetailPanel` + `TaskDetail`** : les deux panneaux peuvent coexister (un clic sur une tâche du `DayDetailPanel` ouvre `TaskDetail` à droite du calendrier dans AppShell). C'est le comportement voulu.
- **`useResizable` côté dragging** : le `ResizeHandle` est à gauche du `DayDetailPanel` ; le delta `startX - e.clientX` est positif quand on tire vers la gauche, ce qui augmente la largeur. Comportement correct avec le hook existant.
