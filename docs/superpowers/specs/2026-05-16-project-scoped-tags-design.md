# Design : Tags scoped par projet

## Contexte

Les tags sont actuellement globaux. Cette feature introduit une appartenance optionnelle à un projet, permettant des tags génériques (partagés partout) et des tags spécifiques à un projet.

---

## Comportements cibles

### Tags génériques vs tags de projet

- Un tag avec `project_id = NULL` est **générique** — visible dans tous les contextes.
- Un tag avec `project_id = <id>` est **spécifique** à ce projet — visible uniquement dans ce projet.

### TagSelector (affectation d'un tag à une tâche)

- Si la tâche est dans un projet : affiche les tags de ce projet + les tags génériques.
- Si la tâche est dans l'Inbox (pas de projet) : affiche uniquement les tags génériques.
- Créer un tag depuis une tâche dans un projet → tag automatiquement lié à ce projet.
- Créer un tag depuis l'Inbox → tag générique.

### TagManager (vue globale)

- Tags groupés : section **"Génériques"** en tête, puis une section par projet.
- Création depuis le TagManager global : sélecteur de projet optionnel (vide = générique).
- Création depuis le TagManager quand un projet est actif : projet pré-rempli.
- Édition d'un tag : sélecteur de projet modifiable, **sauf si** une tâche utilisant ce tag appartient déjà à un projet — dans ce cas, le sélecteur est désactivé avec un message explicatif.

### Suppression d'un projet

- Les tags spécifiques à ce projet sont **supprimés en cascade** (soft-delete).
- Les liaisons `task_tags` correspondantes sont supprimées avant.

---

## Schéma

### Migration `004_tags_project_scope.sql`

```sql
ALTER TABLE tags ADD COLUMN project_id TEXT REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_tags_project_id ON tags(project_id);
```

Tags existants → `project_id = NULL` (génériques, aucune action requise).

---

## Types TypeScript

### `Tag` (src/types/index.ts)

```ts
interface Tag {
  id: string;
  name: string;
  color: string | null;
  projectId: string | null; // null = générique
}
```

### `CreateTagInput`

```ts
interface CreateTagInput {
  name: string;
  color?: string;
  projectId?: string | null;
}
```

---

## Repository (src/db/repository.ts + sqlite-repository.ts)

### `getTags(projectId?: string | null)`

- `undefined` (sans argument) : retourne tous les tags — utilisé par le TagManager global.
- `null` : retourne uniquement les génériques (`WHERE project_id IS NULL`) — contexte Inbox.
- `string` : retourne les tags du projet + les génériques (`WHERE project_id = ? OR project_id IS NULL`).

### `isTagUsedInProjectTasks(tagId: string): Promise<boolean>`

Nouvelle méthode, appelée à l'ouverture du formulaire d'édition d'un tag :

```sql
SELECT COUNT(*) as count FROM task_tags tt
JOIN tasks t ON t.id = tt.task_id
WHERE tt.tag_id = ? AND t.project_id IS NOT NULL AND t.deleted_at IS NULL
```

Retourne `true` si `count > 0`. Si `true`, le sélecteur de projet dans l'édition est désactivé avec le message : _"Ce tag est utilisé par des tâches dans un projet."_

### `deleteProject(id)`

Avant le soft-delete du projet :

1. `DELETE FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE project_id = ?)`
2. `UPDATE tags SET deleted_at = ?, updated_at = ? WHERE project_id = ?`
3. Puis soft-delete du projet comme avant.

---

## Store (src/store/tags.ts)

`loadTags(repo, projectId?)` — transmet le `projectId` optionnel à `repo.getTags()`.

---

## Composants

### TagSelector (src/components/tasks/TagSelector.tsx)

- Reçoit une prop `projectId: string | null | undefined`.
- Filtre les tags visibles via `loadTags(repo, projectId)` (pass-through direct, pas de `?? undefined`).
- `handleCreate` inclut `projectId` dans `CreateTagInput` si la tâche est dans un projet.

### TagManager (src/components/tags/TagManager.tsx)

- Lit `selectedProjectId` depuis `useUIStore` pour pré-remplir le projet à la création.
- Affiche les tags groupés par section (génériques en premier, puis par projet avec couleur en en-tête).
- Formulaire d'édition : sélecteur de projet, désactivé + message si `isTagUsedInProjectTasks` retourne `true`.

---

## Tests

Les tests suivent les patterns existants : `makeDb()` avec `vi.fn()` pour le repository, `makeRepo()` pour les stores.

### `src/db/sqlite-repository.test.ts` — section "SqliteRepository — tags"

Modifications :

- Mettre à jour le `TagRow` interne pour inclure `project_id: string | null`.
- Mettre à jour les fixtures existantes pour passer `project_id: null`.

Nouveaux tests :

- **`getTags(null)` retourne uniquement les génériques** — vérifie que le SQL contient `project_id IS NULL` et ne contient pas `OR`.
- **`getTags('proj-1')` retourne les tags du projet et les génériques** — vérifie que le SQL contient `project_id = ?` et `project_id IS NULL` avec un OR, et que `params` contient `'proj-1'`.
- **`createTag` avec `projectId` persiste `project_id`** — vérifie que `db.execute` est appelé avec la valeur du `project_id` dans `params`.
- **`isTagUsedInProjectTasks` retourne `true` quand des tâches dans un projet utilisent le tag** — mock `db.select` retournant `[{ count: 1 }]`, vérifie `result === true`.
- **`isTagUsedInProjectTasks` retourne `false` quand aucune tâche dans un projet n'utilise le tag** — mock `db.select` retournant `[{ count: 0 }]`, vérifie `result === false`.

### `src/db/sqlite-repository.test.ts` — section "SqliteRepository — projects"

Nouveau test :

- **`deleteProject` supprime les `task_tags` et les tags du projet avant le soft-delete** — vérifie que `db.execute` est appelé 3 fois dans l'ordre : `DELETE FROM task_tags`, `UPDATE tags SET deleted_at`, `UPDATE projects SET deleted_at`, chacun avec le bon `project_id` dans `params`.

### `src/store/tags.test.ts`

Modifications :

- Mettre à jour `baseTag` pour inclure `projectId: null`.

Nouveaux tests :

- **`loadTags` avec `projectId` appelle `getTags` avec la bonne valeur** — crée un repo avec `getTags: vi.fn().mockResolvedValue([])`, appelle `loadTags(repo, 'proj-1')`, vérifie que `repo.getTags` a été appelé avec `'proj-1'`.
- **`createTag` avec `projectId` transmet `projectId` au repo** — crée un tag avec `{ name: 'x', projectId: 'proj-1' }`, vérifie que `repo.createTag` a été appelé avec un objet contenant `projectId: 'proj-1'`.

---

## Ce qui ne change pas

- `task_tags` : inchangé (liaison tâche ↔ tag).
- Filtrage des tâches par tag (`TaskFilters.tagIds`) : inchangé.
- Logique de tri/réordonnancement : inchangée.
