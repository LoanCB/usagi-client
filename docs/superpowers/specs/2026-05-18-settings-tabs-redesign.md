# Settings Dialog — Refonte en onglets

**Date :** 2026-05-18

**Objectif :** Restructurer le `SettingsDialog` pour résoudre trois problèmes UX : la section Données est enfouie sans identité propre, les checkboxes d'export prennent trop de place, et l'import manque de présence visuelle. Solution : introduire trois onglets (Général / Notifications / Données) et remplacer les checkboxes par des chips cliquables.

---

## Décisions de design

| Problème constaté                                   | Décision                                        |
| --------------------------------------------------- | ----------------------------------------------- |
| Section Données sans délimitation, effet "posée là" | Onglet dédié `Données`                          |
| 5 checkboxes export trop denses                     | Chips pill cliquables (`border-radius: 9999px`) |
| Section Import réduite à un bouton                  | Card avec description + bouton pleine largeur   |
| Dialog trop chargé en colonne droite                | Notifications sort dans son propre onglet       |
| Raccourcis perdus en bas de colonne gauche          | Migre en colonne droite sous Vues Sidebar       |

---

## Architecture — 3 onglets

### Onglet Général

Layout deux colonnes identique à l'actuel, contenu redistribué :

| Colonne gauche                               | Colonne droite                             |
| -------------------------------------------- | ------------------------------------------ |
| Apparence (thème + glassmorphism + parallax) | Vues Sidebar (calendrier, archives, tags)  |
| Langue                                       | Raccourcis (urgence, date, projet + reset) |

Les Raccourcis **migrent** de la colonne gauche vers la colonne droite (sous Vues Sidebar). La colonne gauche se retrouve moins chargée.

### Onglet Notifications

Contenu identique à la section Notifications actuelle, sans changement fonctionnel. L'onglet dédié lui donne de l'espace et retire la pression sur la colonne droite.

### Onglet Données

Layout responsive : `flex-row` quand le dialog est assez large, `flex-col` sinon (même mécanique que le layout deux-colonnes existant avec `sm:flex-row`).

**Card Export** (flex: 1) :

- Titre « Exporter »
- Label « Contenu à inclure »
- Chips pill pour les 5 options (actives, terminées, archivées, projets, tags) — chip activé = bordure + texte `primary`, désactivé = bordure + texte `muted`
- `MultiSelect` pour filtrer par projet (inchangé)
- Bouton « ↓ Exporter » pleine largeur de la card

**Card Import** (flex: 1) :

- Titre « Importer »
- Description : « Restaurer depuis un fichier JSON exporté depuis Usagi. Tu choisiras de fusionner ou remplacer tes données existantes. »
- `flex: 1` sur le corps pour pousser le bouton en bas
- Bouton « ↑ Choisir un fichier… » pleine largeur de la card

Pas de traitement visuel danger (pas de teinte rouge) — l'avertissement destructif reste dans `ImportConfirmDialog` qui suit.

---

## Composant tab bar

Implémenté en JSX natif (pas de librairie externe). Un état local `activeTab: 'general' | 'notifications' | 'data'` contrôle quel panneau est rendu.

```tsx
const [activeTab, setActiveTab] = useState<
  "general" | "notifications" | "data"
>("general");
```

Le tab bar est positionné dans le `DialogHeader`, sous le titre, avec `border-bottom` sur le header pour que les onglets actifs s'y ancrent visuellement (pattern underline classique).

---

## Chips d'export

Remplacement des `<Checkbox>` + `<label>` par des `<button>` pill :

```tsx
<button
  type="button"
  onClick={() => setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
  className={cn(
    "rounded-full border px-3 py-1 text-xs transition-colors",
    exportOptions[key]
      ? "border-primary text-primary"
      : "border-input text-muted-foreground",
  )}
>
  {label}
</button>
```

La logique métier (`ExportOptions`, `exportData`) ne change pas.

---

## Fichiers modifiés

| Fichier                                    | Nature                                             |
| ------------------------------------------ | -------------------------------------------------- |
| `src/components/layout/SettingsDialog.tsx` | Restructuration complète du JSX + état `activeTab` |

Aucun autre fichier modifié. Les composants existants (`MultiSelect`, `ImportConfirmDialog`, stores, i18n) restent inchangés.

---

## Ce qui ne change pas

- `ImportConfirmDialog` : flux merge/replace identique
- `MultiSelect` : composant inchangé
- `ExportOptions` / `exportData` : logique inchangée
- Toutes les clés i18n existantes : inchangées
- Les raccourcis clavier du dialog : inchangés

---

## Contraintes

- Le dialog a déjà `max-h-[85vh]` et `overflow-y-auto` sur son contenu — chaque panneau d'onglet hérite de ce comportement.
- La tab bar vit dans le `DialogHeader` qui est `sticky` implicitement, donc les onglets restent visibles en scrollant un panneau long (notamment Général).
- Pas de transition animée entre onglets (hors scope, complexité non justifiée pour des settings).
