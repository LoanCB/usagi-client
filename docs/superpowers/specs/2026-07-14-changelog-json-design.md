# Changelog JSON — Design

Date: 2026-07-14

## Objectif

Générer un changelog **bilingue (fr/en)** dans un fichier JSON, à partir de
l'historique git. Les tags **non-beta** représentent les versions. Le fichier
sert à la fois d'artefact (release notes) et de source consommable par l'app
(vue « Nouveautés »).

## Emplacement

`src/assets/changelog.json` — dans `src/` pour être importable au build par
l'app, à côté des autres assets, et lisible tel quel comme artefact.

## Schéma JSON

```json
{
  "generatedAt": "2026-07-14",
  "versions": [
    {
      "version": "Unreleased",
      "tag": null,
      "date": null,
      "changes": {
        "features": [
          { "en": "cleaned commit subject", "fr": "sujet traduit" }
        ],
        "fixes": [
          { "en": "...", "fr": "..." }
        ]
      }
    },
    {
      "version": "2026.2.1",
      "tag": "v2026.2.1",
      "date": "2026-06-30",
      "changes": {
        "features": [
          { "en": "add project filter on daily and all task lists", "fr": "ajout d'un filtre projet sur les listes du jour et de toutes les tâches" }
        ],
        "fixes": [
          { "en": "console errors", "fr": "erreurs console" }
        ]
      }
    }
  ]
}
```

Règles de schéma :

- `versions` triées de la plus récente à la plus ancienne (par date de création
  du tag).
- `version` = le tag sans le préfixe `v` ; `"Unreleased"` pour les commits non
  publiés.
- `changes` ne contient une clé (`features` / `fixes` / `performance`) que si
  elle possède au moins une entrée.
- Chaque entrée est bilingue : `{ "en": "...", "fr": "..." }`. `en` est le sujet
  de commit nettoyé (les commits sont déjà en anglais) ; `fr` est la traduction.
  L'app choisira via la locale i18n courante, avec fallback `en` (cohérent avec
  `fallbackLng: "en"`).

## Découpage des versions (tags non-beta uniquement)

- Frontières = tags **non-beta** seulement. Sont ignorés : les tags suffixés
  `-beta*` et `latest-beta`.
- Chaque version regroupe tous les commits entre le tag non-beta précédent et ce
  tag, **betas incluses** (une beta est une pré-release repliée dans la version
  finale).
- Tri des tags par date de création (`creatordate`), pas alphabétique, pour
  éviter les erreurs de tri numérique (ex. `v0.3.3-6` vs `v0.3.3-10`).

## Section « Unreleased »

Les commits situés après le dernier tag non-beta (`v2026.2.1`) sont regroupés
dans une entrée en tête : `version: "Unreleased"`, `tag: null`, `date: null`.

## Filtrage & nettoyage (user-facing)

- **Garder** : `feat` → `features`, `fix` → `fixes`, `perf` → `performance`.
- **Exclure** : `chore`, `ci`, `build`, `refactor`, `docs`, `test`, les merges
  (`Merge pull request…`) et les commits de test (`empty commit to test fix`).
- **Nettoyage** de chaque sujet, dans l'ordre :
  1. retirer le préfixe `type(scope):` ;
  2. retirer les shortcodes gitmoji `:xxx:` **et** les emojis Unicode bruts
     (certains commits utilisent `🐛` au lieu de `:bug:`) ;
  3. `trim` des espaces résiduels.

## Production

- Génération **unique** : script jetable dans le scratchpad (Node, lit `git`),
  sortie unique écrite dans `src/assets/changelog.json`.
- **Pas** de script versionné, **pas** d'entrée `package.json`, pas de hook CI.
- Les traductions `fr` sont produites au moment de la génération.

## Hors périmètre

- Régénération automatique / script réutilisable.
- Intégration UI (composant d'affichage) — non demandée ici ; seul le JSON est
  produit.
- Traduction d'entrées non user-facing (chore/ci/etc.), exclues du changelog.
