# Design : Affecter des tags via le menu contextuel des tâches

**Date :** 2026-05-16  
**Statut :** Approuvé

---

## Objectif

Permettre à l'utilisateur d'affecter ou retirer des tags à une tâche directement depuis le menu contextuel (clic droit) dans la liste des tâches, sans ouvrir le panneau de détail.

---

## Architecture

Deux fichiers sont modifiés, aucun nouveau fichier créé.

### 1. `src/components/ui/context-menu.tsx`

Exposer 4 nouveaux composants issus des primitives base-ui déjà disponibles :

- **`ContextMenuCheckboxItem`** — wraps `ContextMenuPrimitive.CheckboxItem`. `closeOnClick` implicitement `false` (défaut base-ui), ce qui permet de toggler plusieurs tags sans fermer le menu.
- **`ContextMenuCheckboxItemIndicator`** — wraps `ContextMenuPrimitive.CheckboxItemIndicator`. Affiche le checkmark quand l'item est coché.
- **`ContextMenuSeparator`** — wraps `Separator` (déjà dans les parts base-ui). Sépare visuellement "Supprimer" de la section tags.
- **`ContextMenuGroupLabel`** — wraps `ContextMenuPrimitive.GroupLabel`. Affiche le label "Tags" en en-tête de section.

Ces composants suivent exactement le même pattern que `ContextMenuItem` existant.

### 2. `src/components/tasks/TaskItem.tsx`

Dans le `ContextMenuContent` existant, ajouter sous l'item "Supprimer" :

```
[ Supprimer ]          ← existant
──────────────
Tags                   ← GroupLabel
● Design    ✓          ← CheckboxItem (coché = tag déjà affecté)
● Frontend             ← CheckboxItem
● Urgent               ← CheckboxItem
```

**Logique de filtrage des tags :** identique à `TagSelector` — tags globaux (`projectId === null`) + tags du projet de la tâche. Si la tâche n'a pas de projet, tous les tags globaux.

**Logique de toggle :** à chaque `onCheckedChange`, appel immédiat à `updateTask(repo, task.id, { tagIds: newIds })`. Pas d'état local intermédiaire — sauvegarde optimiste comme le reste du store.

**Pas de "créer un tag"** dans ce menu : l'utilisateur peut créer des tags depuis le panneau de détail ou le TagManager. Le menu contextuel est un outil d'affectation rapide, pas de création.

---

## Flux de données

```
clic droit sur tâche
  → ContextMenu s'ouvre
  → tags filtrés par scope projet lus depuis useTagStore()
  → chaque CheckboxItem checked = task.tags.some(t => t.id === tag.id)
  → clic sur un tag → onCheckedChange(checked)
    → newIds = checked ? [...currentIds, tagId] : currentIds.filter(id !== tagId)
    → updateTask(getRepository(), task.id, { tagIds: newIds })
    → store met à jour task.tags en mémoire
  → menu reste ouvert (closeOnClick: false)
```

---

## Gestion des cas limites

- **Aucun tag disponible** : afficher un texte `t("tag.noTags")` non-cliquable (même pattern que TagSelector).
- **Tags nombreux** : le `ContextMenuContent` a déjà `overflow-y-auto max-h-(--available-height)` — le scroll est géré automatiquement.
- **Erreur de sauvegarde** : `updateTask` peut throw, mais le store ne fait pas de rollback sur `updateTask` (contrairement à `reorderTasks`). Comportement acceptable pour ce cas.

---

## Ce qui ne change pas

- `TagSelector.tsx` — inchangé, reste utilisé dans le panneau de détail et le formulaire de création.
- `tags.ts` store — inchangé.
- Aucune nouvelle traduction requise (`tag.tags` et `tag.noTags` existent déjà).
