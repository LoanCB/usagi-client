# Drag & Drop Animation — Design Spec

**Date:** 2026-05-13  
**Status:** Approved

## Problem

Quand l'utilisateur déplace une tâche par drag & drop, aucun feedback visuel clair n'est présent : l'item devient légèrement transparent sur place, sans indication de où il va être déposé. L'expérience est confuse.

## Solution choisie

**Style : Fantôme + ligne de drop intercalée**

- L'item dragué devient un fantôme quasi-invisible (il reste à sa place dans le DOM)
- Une ligne colorée apparaît entre les items pour indiquer précisément la position de dépôt
- Les autres items glissent pour faire de la place (comportement déjà géré par dnd-kit)

## Architecture

### Fichiers modifiés

- `src/components/layout/TaskList.tsx` — tracking de l'état de drag, calcul de l'index de la ligne, rendu intercalé
- `src/components/tasks/TaskItem.tsx` — style fantôme sur `isDragging`

### Nouveau composant

`DropLine` — composant inline dans `TaskList.tsx` (ne justifie pas un fichier séparé) :

```tsx
function DropLine() {
  return (
    <div className="relative flex items-center mx-3 my-0.5 pointer-events-none">
      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
      <div className="flex-1 h-0.5 bg-primary" />
    </div>
  );
}
```

### État dans TaskList

Deux nouveaux états locaux :

```ts
const [activeId, setActiveId] = useState<string | null>(null);
const [overId, setOverId] = useState<string | null>(null);
```

Mis à jour via :
- `onDragStart`: `setActiveId(event.active.id as string)`
- `onDragOver`: `setOverId(event.over?.id as string ?? null)`
- `onDragEnd`: reset `activeId` et `overId` à `null` (après le reorder existant)

### Calcul de la position de la ligne

On exprime la position comme `insertBefore` : l'index de l'item devant lequel la `<DropLine />` s'insère.

```ts
function getInsertBefore(tasks: Task[]): number | null {
  if (!activeId || !overId || activeId === overId) return null;
  const ai = tasks.findIndex(t => t.id === activeId);
  const oi = tasks.findIndex(t => t.id === overId);
  if (ai === -1 || oi === -1) return null;
  // drag vers le bas → ligne après l'item survolé
  // drag vers le haut → ligne avant l'item survolé
  return ai < oi ? oi + 1 : oi;
}
```

`insertBefore` peut valoir `tasks.length` (ligne après le dernier item).

### Rendu des items

```tsx
const insertBefore = getInsertBefore(filteredTasks);

const items: React.ReactNode[] = [];
filteredTasks.forEach((task, i) => {
  if (insertBefore === i) items.push(<DropLine key="drop-line" />);
  items.push(<TaskItem key={task.id} task={task} ... />);
});
if (insertBefore === filteredTasks.length) items.push(<DropLine key="drop-line" />);
```

### Style fantôme dans TaskItem

```ts
opacity: isDragging ? 0.15 : undefined,
```

Remplace le `0.5` actuel.

## Non-inclus

- Pas de `DragOverlay` (pas nécessaire pour ce style)
- Pas de changement au `handleDragEnd` existant (le reorder reste inchangé)
- La désactivation du drag pendant la recherche (filtre actif) reste inchangée
