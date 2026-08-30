# Extension de la criticité à 7 niveaux — Design

## Contexte

Le champ « criticité » (nommé `Priority` dans le code) propose aujourd'hui 4 valeurs :
`null` / basse / moyenne / haute. On veut l'étendre à 7 niveaux et refondre son
rendu visuel (mode normal **et** mode daltonien) en s'inspirant du design de Jira :
chevrons verticaux pour les niveaux faibles/élevés, signe égal pour moyen, sens
interdit pour bloquant.

## Objectifs

1. Passer de 4 à 7 valeurs de criticité.
2. Unifier le rendu en une seule icône façon Jira, colorée, utilisée partout.
3. Centraliser les couleurs de priorité en une source unique (échelle Jira bleu→rouge).
4. Aucune régression de données existantes.

## Modèle de données

Le type `Priority` conserve les noms existants (pas de migration SQLite) et ajoute
trois valeurs :

```ts
type Priority =
  | "none"
  | "lowest"
  | "low"
  | "medium"
  | "high"
  | "highest"
  | "blocker";
```

| Valeur    | Libellé FR | Libellé EN | Icône lucide (sens vertical) | Poids tri |
| --------- | ---------- | ---------- | ---------------------------- | --------- |
| `none`    | Aucune     | None       | (aucune icône)               | 0         |
| `lowest`  | Très basse | Lowest     | `ChevronsDown` (double ↓↓)   | 1         |
| `low`     | Basse      | Low        | `ChevronDown` (↓)            | 2         |
| `medium`  | Moyenne    | Medium     | `Equal` (=)                  | 3         |
| `high`    | Haute      | High       | `ChevronUp` (↑)              | 4         |
| `highest` | Très haute | Highest    | `ChevronsUp` (double ↑↑)     | 5         |
| `blocker` | Bloquant   | Blocker    | `Ban` (sens interdit)        | 6         |

Basses → chevrons vers le bas, hautes → chevrons vers le haut.

La colonne SQLite `priority` reste une `string` sans contrainte d'enum et son défaut
reste `"none"`. Comme on conserve les noms `none`/`low`/`medium`/`high`, **aucune
migration** n'est nécessaire : les lignes existantes restent valides.

## Palette centralisée

Nouveau fichier `src/theme/priorityColors.ts` — **source unique de vérité** pour les
couleurs de criticité, partagée par tous les thèmes et composants :

```
lowest  #4c9aff
low     #2dd4bf
medium  #eab308
high    #f97316
highest #ef4444
blocker #991b1b
```

Conséquences :

- On retire `--priority-high` / `--priority-medium` / `--priority-low` des 13 fichiers
  de thème (`src/theme/themes/*.ts`) et de `src/theme/types.ts`.
- On supprime les valeurs codées en dur (hex `#ef4444`… et rgba) dans
  `PriorityIndicator`, `PrioritySelector`, `TaskItem`.
- Les tons de fond/bordure des lignes de tâche (aujourd'hui `PRIORITY_BG` /
  `PRIORITY_BORDER`) sont dérivés par opacité depuis la couleur de base
  (ex. `${color}20` pour le fond, `${color}4d` pour la bordure), sans tables séparées.

Les tons choisis sont des tons moyens qui passent sur fond clair et sombre. Comme la
forme de l'icône distingue déjà chaque niveau, le contraste de couleur n'est plus le
seul canal d'information. Si un niveau manque de contraste sur un thème précis, on
ajuste l'opacité du fond plutôt que la teinte.

## Composant unifié `PriorityIcon`

Un unique composant remplace les trois chemins de rendu actuels (pastille colorée du
mode normal, drapeau du sélecteur, barres du mode daltonien). Il rend le glyph Jira
coloré à partir de la palette centralisée.

Comme la **forme** (nombre et sens des chevrons, égal, sens interdit) distingue chaque
niveau indépendamment de la couleur, l'icône est accessible par nature : **le mode
daltonien affiche la même icône** que le mode normal. On supprime le rendu « 3 barres ».
Le prop `colorblindMode` n'est plus consommé pour la priorité ; les renforts daltoniens
non liés à la priorité déjà en place (ex. soulignement des dates en retard dans
`TaskMeta`) sont conservés tels quels.

Interface indicative :

```tsx
interface PriorityIconProps {
  readonly priority: Priority;
  readonly size?: number;
}
```

Points d'intégration :

- `PriorityIndicator` (indicateur dans la liste de tâches) — s'appuie sur `PriorityIcon`.
- `PrioritySelector` (dropdown de sélection) — icône + libellé.
- `FilterBar` (filtre de criticité) — icône + libellé, liste des 7 valeurs.
- `TaskForm` (select du formulaire) — icône + libellé, options des 7 valeurs.

## Fichiers touchés

- `src/types/index.ts` — extension du type `Priority`.
- `src/theme/priorityColors.ts` — **nouveau** module palette.
- `src/theme/types.ts` — retrait des trois `--priority-*`.
- `src/theme/themes/*.ts` (13 fichiers) — retrait des trois `--priority-*`.
- `src/components/tasks/TaskItem/PriorityIcon.tsx` — **nouveau** composant unifié.
- `src/components/tasks/TaskItem/PriorityIndicator.tsx` — délègue à `PriorityIcon`.
- `src/components/tasks/PrioritySelector.tsx` — icône unifiée + 7 valeurs.
- `src/components/tasks/TaskItem.tsx` — fond/bordure dérivés de la palette.
- `src/components/tasks/TaskForm.tsx` — 7 options + libellés.
- `src/components/tasks/FilterBar.tsx` — 7 valeurs + libellés.
- `src/components/layout/TaskList.tsx` — `PRIORITY_WEIGHT` étendu aux 7 niveaux.
- `src/i18n/locales/fr.ts` + `en.ts` — libellés `lowest` / `highest` / `blocker`.
- Tests concernés : `src/test/TaskItem.test.tsx`, `src/db/sqlite-repository.test.ts`,
  `src/components/layout/TaskList.test.tsx`, et tout test référençant les valeurs de
  priorité.

## Hors périmètre

- Pas de migration de schéma SQLite.
- Pas de refonte des renforts daltoniens non liés à la priorité.
- Pas de personnalisation par thème des couleurs de priorité (palette unique assumée).

## Critères de réussite

- Les 7 niveaux sont sélectionnables (formulaire, sélecteur, filtre) et persistés.
- Chaque niveau affiche l'icône Jira correcte, colorée, identique en mode normal et
  daltonien.
- Le tri par criticité respecte l'ordre `none < lowest < low < medium < high < highest
< blocker`.
- Les données existantes (`none`/`low`/`medium`/`high`) s'affichent sans erreur.
- `react-doctor` et `pnpm run lint:fix` passent proprement sur le code modifié.
