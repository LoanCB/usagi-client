# Édition inline du titre d'une tâche par double-clic

**Date:** 2026-06-30
**Statut:** Validé

## Objectif

5+
Permettre d'éditer le titre d'une tâche directement dans la liste, sans ouvrir le panneau de détail, via un double-clic sur le titre.

## Périmètre

Modifie un seul fichier : [src/components/tasks/TaskItem.tsx](../../../src/components/tasks/TaskItem.tsx).

Toute la plomberie de persistance existe déjà :

- `updateTask` du store (`useTaskStore`, déjà importé dans `TaskItem.tsx`).
- Signature : `updateTask(repo, id, patch: Partial<CreateTaskInput>)` — supporte `{ title }`.
- Le repository SQLite et la mutation Zustand sont déjà en place.

Aucune modification du store, du repository ou du schéma SQL.

## Comportement

- **Simple clic** sur le titre → inchangé : ouvre le détail (`setSelectedTask(task.id)`).
- **Double-clic** sur le titre → le `<button>` est remplacé par un `<input>` pré-rempli avec le titre courant, auto-focus + texte sélectionné.
- **Entrée** → enregistre et sort du mode édition.
- **Blur** → enregistre et sort du mode édition.
- **Échap** → annule, restaure le titre original, sort du mode édition.
- Enregistrement uniquement si le titre a changé et n'est pas vide (après `trim()`).

## Implémentation

1. État local dans `TaskItem` :
   - `const [isEditing, setIsEditing] = useState(false)`
   - `const [draft, setDraft] = useState(task.title)`
2. `onDoubleClick` sur le bouton titre → `setDraft(task.title); setIsEditing(true)`.
3. Rendu conditionnel : si `isEditing`, afficher un `<input>` à la place du `<button>`.
   - `ref` avec autofocus + `select()` à l'entrée en édition.
   - `onKeyDown` : `Enter` → valide (blur), `Escape` → annule.
   - `onBlur` → valide.
   - Fonction de sauvegarde réutilisant le pattern de
     [TaskDetail.tsx:66-70](../../../src/components/layout/TaskDetail.tsx#L66-L70) :
     `if (draft.trim() && draft.trim() !== task.title) await updateTask(getRepository(), task.id, { title: draft.trim() })`.
4. Empêcher le double-clic / l'édition de déclencher le drag `@dnd-kit` : l'input stoppe
   la propagation des événements pointer pendant l'édition.

## Contraintes visuelles

- L'input garde les mêmes classes visuelles (`flex-1 text-sm`) que le bouton pour éviter
  tout saut de mise en page.
- Hors édition, conserver le `truncate` et le strikethrough du titre des tâches complétées.

## Tests

- Test unitaire (`src/test/TaskItem.test.tsx` existant) :
  - Double-clic affiche un input pré-rempli.
  - Entrée avec nouveau titre appelle `updateTask` avec le titre trimé.
  - Échap n'appelle pas `updateTask` et restaure l'affichage du titre.
  - Simple clic appelle toujours `setSelectedTask` (comportement inchangé).
