# Settings – Onglet "Customisation"

Date : 2026-07-13

## Objectif

Donner à l'utilisateur plus de contrôle sur la personnalisation de l'application via
un nouvel onglet "Customisation" dans la modal des paramètres, et permettre de choisir
quels inputs afficher dans la création rapide de tâche.

## Périmètre

### 1. Nouvel onglet "Customisation"

Dans [SettingsDialog.tsx](../../../src/components/layout/SettingsDialog.tsx) :

- Étendre l'union de `activeTab` avec `"customization"`.
- Ajouter l'entrée `["customization", t("settings.tabCustomization")]` dans le tableau
  des onglets (après "general").
- Nouveau composant `CustomizationPanel` (même fichier), rendu quand
  `activeTab === "customization"`.

### 2. Réorganisation de l'onglet "Général"

`GeneralPanel` passe à :

- **Colonne gauche** : Apparence uniquement (la section Langue est retirée d'ici).
- **Colonne droite** : Raccourcis (en haut, à la place des vues de sidebar), séparateur,
  puis Langue (déplacée en dessous).

La section "Vues de la sidebar" quitte `GeneralPanel`.

### 3. Contenu de `CustomizationPanel`

Deux sections :

- **Vues de la sidebar** : les 4 switches déplacés depuis `GeneralPanel`, sans changement
  de logique (déjà branchés sur `useSettingsStore`).
- **Création rapide de tâche** : 3 switches contrôlant la visibilité des inputs :
  Priorité, Date d'échéance, Tags.

### 4. Persistance – nouveaux réglages

Dans [settings.ts](../../../src/store/settings.ts), en suivant le pattern existant
(champ dans le store + setter `set(repo, value)` + clé snake_case + parsing dans
`loadSettings`) :

| Champ store               | Clé SQLite                  | Défaut | Parsing loadSettings              |
| ------------------------- | --------------------------- | ------ | --------------------------------- |
| `quickAddPriorityVisible` | `quick_add_priority_visible`| `false`| `=== "true"`                      |
| `quickAddDueDateVisible`  | `quick_add_due_date_visible`| `false`| `=== "true"`                      |
| `quickAddTagsVisible`     | `quick_add_tags_visible`    | `true` | `!== "false"`                     |

Par défaut, seul Tags est visible.

### 5. Application dans `QuickAddTask`

Dans [QuickAddTask.tsx](../../../src/components/tasks/QuickAddTask.tsx), lire les 3 flags
et rendre conditionnellement :

- Priorité : `quickAddPriorityVisible && <PrioritySelector .../>`
- Date : `quickAddDueDateVisible && !isCalendarContext && <DueDatePicker .../>`
  (combiner avec le masquage calendrier existant, ne pas le remplacer)
- Tags : `quickAddTagsVisible && <TagSelector .../>`

### 6. i18n

Nouvelles clés dans `fr.ts` et `en.ts` (namespace `settings`) :

- `tabCustomization` : "Customisation" / "Customization"
- `quickAdd` : "Création rapide de tâche" / "Quick task creation"
- `quickAddPriority` : "Priorité" / "Priority"
- `quickAddDueDate` : "Date d'échéance" / "Due date"
- `quickAddTags` : "Tags" / "Tags"

## Hors périmètre

- Pas de persistance du brouillon de tâche (seules les préférences de visibilité sont
  stockées).
- Pas de migration SQL (la table `settings` est déjà clé/valeur générique).

## Vérification

- react-doctor (diagnostics liés à la tâche uniquement) + `pnpm run lint:fix`.
- Vérifier manuellement : nouvel onglet visible, réorganisation Général correcte,
  toggles quick-add persistés et appliqués, date toujours masquée en contexte calendrier.
