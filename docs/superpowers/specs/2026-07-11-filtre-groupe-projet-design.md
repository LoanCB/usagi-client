# Filtrer par groupe de projet

**Date :** 2026-07-11
**Statut :** Design validé, prêt pour le plan d'implémentation

## Objectif

Permettre, dans les filtres par projet des différentes pages (listes de tâches, calendrier, archives), de filtrer aussi par **groupe de projet**. Sélectionner un groupe doit sélectionner l'ensemble de ses projets membres.

## Contexte existant

Il existe un seul composant réutilisable, `src/components/tasks/ProjectFilter.tsx` : un multi-select à plat (cases à cocher dans un `Popover`) consommé par trois surfaces :

- listes de tâches (Aujourd'hui / Toutes) via `src/components/tasks/FilterBar.tsx` — état dans le store Zustand `useUIStore().activeFilters.projectIds` ;
- calendrier `src/components/calendar/CalendarView.tsx` — état local `useState<string[] | null>` ;
- archives `src/components/layout/ArchiveView.tsx` — état local `useReducer` (`projectIds`).

La valeur du filtre est partout un `string[] | null` d'IDs de projets. `null` / `[]` = tous les projets. Le sentinel `INBOX_PROJECT_ID` (de `src/lib/dataTransfer.ts`) représente « sans projet » et est déjà géré par toutes les surfaces (y compris la couche SQL `buildProjectIdsCondition` dans `src/db/sqlite-repository.ts`).

Le composant ne connaît aujourd'hui que `useProjectStore().projects` — il ignore les groupes.

Modèle de groupe déjà présent :

- `ProjectGroup` (`id`, `name`, `color`, `sortOrder`, …) dans `src/types/index.ts` ;
- chaque `Project` porte un `groupId: string | null` ;
- store `useProjectGroupStore()` (`groups: ProjectGroup[]`) dans `src/store/projectGroups.ts` ;
- rendu de la couleur de groupe : `src/components/ui/GroupColorShape.tsx` et `src/lib/group-colors.ts`.

## Principe retenu

**Le groupe est un raccourci de sélection.** La valeur du filtre reste un `string[] | null` d'IDs de projets. Aucune modification de la couche données (`TaskFilters`, SQL, `MemoryRepository`) ni des trois pages consommatrices — la modification est entièrement contenue dans `ProjectFilter.tsx`.

## Périmètre

**Seul fichier de logique modifié :** `src/components/tasks/ProjectFilter.tsx`.
**Tests étendus :** `src/components/tasks/ProjectFilter.test.tsx`.

Les trois pages consommatrices (`FilterBar`, `CalendarView`, `ArchiveView`) ne changent pas.

## Conception détaillée

### 1. Source de données

En plus de `useProjectStore().projects`, lire `useProjectGroupStore().groups`.

Construire une structure d'affichage ordonnée :

1. pour chaque groupe (trié par `sortOrder`) : l'en-tête du groupe suivi de ses projets membres (`projects.filter(p => p.groupId === g.id)`) ;
2. puis les projets sans groupe (`groupId === null`) en cases individuelles à plat ;
3. puis le sentinel Inbox.

Un groupe sans projet membre n'affiche pas d'en-tête (cas limite : un groupe ne devrait jamais être vide côté données car un groupe vidé est auto-supprimé, cf. `assignToGroup`, mais on reste défensif).

### 2. En-tête de groupe (toujours déplié)

Une ligne cliquable comportant :

- la pastille de couleur du groupe (`GroupColorShape`) ;
- le nom du groupe ;
- une case **tri-état** :
  - **cochée** si tous les projets du groupe sont dans la sélection,
  - **indéterminée** si une partie seulement l'est,
  - **vide** si aucun ne l'est.

Comportement au clic sur l'en-tête :

- si le groupe n'est pas déjà entièrement coché → **ajouter** tous les projets du groupe à la sélection ;
- s'il est déjà entièrement coché → **retirer** tous les projets du groupe de la sélection.

Les cases des projets membres restent individuelles : cocher/décocher un projet membre met à jour l'état tri-état de l'en-tête de son groupe.

Pas de repliage/dépliage : les groupes sont toujours dépliés (décision de design — simplicité, pas d'état supplémentaire). Le menu défile si nécessaire.

### 3. Libellé du bouton déclencheur

Après application de la sélection :

- si l'ensemble sélectionné correspond **exactement** à tous les membres d'un seul groupe (et rien d'autre) → afficher `● Nom du groupe` avec la couleur du groupe ;
- sinon, conserver la logique actuelle :
  - un seul projet réel sélectionné → nom du projet coloré,
  - Inbox seul → « Inbox »,
  - plusieurs → « N projets »,
  - rien / `null` → « Tous les projets ».

### 4. Inchangé

- Inbox et les projets sans groupe restent des cases individuelles à plat, sous les groupes.
- La signature du composant (`value: string[] | null`, `onChange`) ne change pas.
- Aucun changement dans les pages consommatrices, la couche données ou les types.

## Tests

Étendre `src/components/tasks/ProjectFilter.test.tsx` :

- cliquer sur un en-tête de groupe sélectionne tous ses projets membres (via `onChange`) ;
- re-cliquer sur un groupe entièrement coché retire ses projets membres ;
- l'état de l'en-tête est **indéterminé** quand seule une partie des membres est sélectionnée ;
- le libellé du bouton affiche le **nom du groupe** quand la sélection = un groupe entier exactement ;
- non-régression : sélection/désélection de projets individuels et du sentinel Inbox fonctionnent comme avant ;
- affichage correct de l'ordre : groupes (par `sortOrder`) → projets sans groupe → Inbox.

## Hors périmètre (YAGNI)

- Pas de repliage des groupes dans le menu.
- Pas de nouveau champ de type de filtre (`groupIds`), pas de changement SQL / `MemoryRepository`.
- Pas de persistance d'un état de sélection de groupe (le filtre reste une liste de projets).
- Pas de second sélecteur « Groupes » séparé.

## Définition de « terminé »

Après implémentation : lancer le skill `react-doctor` (corriger uniquement les diagnostics introduits par la tâche) puis `pnpm run lint:fix`.
