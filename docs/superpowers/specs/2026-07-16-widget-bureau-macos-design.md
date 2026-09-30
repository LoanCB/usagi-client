# Widget de bureau macOS — Design

**Date** : 2026-07-16
**Projet** : Bunly (usagi-client) — app Tauri 2 (React 19 + Rust), base SQLite via `plugin-sql`.

## Objectif

Offrir une vignette de tâches posée **au niveau du bureau** macOS, affichée en
permanence mais **masquée par les fenêtres d'applications ouvertes** (visible
seulement quand le bureau l'est), avec possibilité de **cocher** les tâches. Une
**icône de barre de menu** sert de point d'entrée « appelable » pour afficher/masquer
le widget et ouvrir l'app complète. **Aucune icône Dock** ne traîne quand on
n'utilise pas l'app principale. Le tout **désactivé par défaut**, activable dans les
paramètres.

## Décisions validées

| Réf | Décision |
|-----|----------|
| a | **Dock dynamique** : app en `Accessory` par défaut (pas de Dock) ; bascule `Regular` quand la fenêtre principale est ouverte ; retour `Accessory` à sa fermeture. |
| b | **Réactivité inter-fenêtres** via un bus d'événements Tauri (`tasks-changed`). |
| — | **Niveau bureau** (pas « toujours au-dessus ») : la fenêtre passe sous les fenêtres normales, visible seulement quand le bureau est dégagé. |
| c | **Taille fixe** (non redimensionnable pour l'instant), repositionnable. |
| d | **Poignée de déplacement au survol** uniquement (UI épurée). |
| e | **Vue configurable** : sélecteur Aujourd'hui / Toutes / par projet, choix mémorisé. |
| — | **Activé par réglage** (`widgetEnabled`, défaut `false`). |
| f | **Autostart couplé au réglage** : activer le widget active aussi le lancement à la session ; le désactiver le retire. |

## Approches écartées

- **WidgetKit natif** (vrai widget système SwiftUI dans le Centre de notifications /
  bureau) : nécessite Swift/SwiftUI, un App Group, une signature et un compte
  développeur Apple payant, plus une injection manuelle du `.appex` dans le bundle
  produit par Tauri (fragile, casse à chaque build). Ratio valeur/effort défavorable
  pour l'objectif visé. On ne peut pas y réutiliser l'UI React (rendu SwiftUI figé).
- **Fenêtre toujours-au-dessus** : recouvre le travail en cours ; l'utilisateur veut
  au contraire une vignette effacée par les apps ouvertes.

## Architecture générale

Trois surfaces, **un seul processus Tauri, une seule base SQLite** :

1. **Fenêtre `main`** — l'app Bunly actuelle, inchangée, ouverte à la demande.
2. **Fenêtre `widget`** — 2ᵉ WebView chargeant une entrée React dédiée et compacte,
   convertie en `NSPanel`, posée au niveau du bureau.
3. **Icône de barre de menu** (`TrayIcon` natif Tauri 2) — menu : *Afficher/Masquer le
   widget*, *Ouvrir Bunly*, *Quitter*.

**Avantage clé vs WidgetKit** : la fenêtre `widget` étant une WebView de la même app,
elle interroge **directement la base SQLite** existante (`plugin-sql`). Aucun App
Group ni snapshot à synchroniser.

## Comportement macOS de la fenêtre widget

Conversion en `NSPanel` via `tauri-nspanel`, avec :

- **Niveau = bureau** → passe sous les fenêtres normales.
- **`canJoinAllSpaces` + `stationary`** → présente sur tous les Spaces, ignorée par
  Mission Control / Exposé.
- **`nonactivatingPanel`** → les clics (cocher une tâche) ne volent pas le focus et ne
  ramènent pas l'app au premier plan.
- **Transparente, sans bordure ni barre de titre**, absente du Dock et de `Cmd-Tab`.

**Contrepartie assumée** : la vignette n'est cliquable que lorsqu'elle est visible
(bureau dégagé). Pour interagir quand elle est cachée, l'utilisateur passe par la barre
de menu.

**Déplacement / position** : poignée `data-tauri-drag-region` révélée au survol ; la
position (x/y) est persistée pour réapparaître au même endroit au lancement suivant.

## Vue React du widget

Entrée dédiée `widget.html` + `src/widget/main.tsx` (bundle mince ne montant que le
nécessaire : repo SQLite + `TaskItem` + i18n ; ni sidebar, ni calendrier, ni TipTap).

- **Sélecteur en tête** : Aujourd'hui / Toutes / par projet. Le filtrage « par projet »
  **reprend le comportement du filtre de projets des listes de tâches**
  (`src/components/tasks/ProjectFilter.tsx`), en version compacte. Choix mémorisé
  (clé `widget_view`).
- **Réutilise `TaskItem`** pour le rendu et le cochage (`completeTask` /
  `uncompleteTask` du `useTaskStore`) — pas de logique dupliquée.
- **Fond translucide** (glassmorphism léger), scroll interne si débordement.
- **Poignée de déplacement au survol** (bandeau translucide en haut).

## Cycle de vie & réactivité

### Pilotage par le réglage (`widgetEnabled`, défaut `false`)

- Case dans `SettingsDialog` → `setWidgetEnabled(repo, boolean)` (même patron que les
  autres réglages : clé `widget_enabled`, `=== "true"`).
- `true` → commande Rust `create_widget` (crée la fenêtre + conversion NSPanel) +
  enregistrement autostart. `false` → `destroy_widget` + retrait autostart.
- Au lancement : la fenêtre widget n'est créée que si le réglage est actif.

### Dock dynamique + survie en arrière-plan

- App `Accessory` par défaut ; `Regular` quand `main` est visible ; `Accessory` à sa
  fermeture. Géré dans `.on_window_event`.
- Fermer `main` **ne quitte pas** l'app (le widget/tray doit survivre). Le vrai
  « Quitter » se fait via le menu de la barre de menu.

### Réactivité inter-fenêtres

- Chaque fenêtre a son propre contexte JS → le store Zustand n'est pas partagé.
- Toute mutation de tâche émet un événement Tauri **`tasks-changed`**, émis de façon
  centralisée dans la **couche repository** (`src/db/repository.ts`) après chaque
  écriture SQLite.
- `main` et `widget` écoutent `tasks-changed` et rechargent leur liste → cochage
  répercuté en temps réel dans les deux sens.

## Config Tauri & plugins

### Dépendances Rust (`src-tauri/Cargo.toml`)

- `tauri-nspanel` (dépendance git) — conversion NSPanel, niveau, collection behaviour.
- `tauri-plugin-autostart = "2"` — lancement à la session.
- Feature **`tray-icon`** activée sur `tauri`.

### Enregistrement (`src-tauri/src/lib.rs`)

- Ajout des plugins autostart + nspanel.
- `TrayIcon` + menu (Afficher/Masquer, Ouvrir Bunly, Quitter).
- Commandes exposées : `create_widget`, `destroy_widget`, `set_activation_policy`
  (appelées depuis le JS au basculement du réglage / événements de fenêtre).
- `.on_window_event` : Dock dynamique + non-quit à la fermeture de `main`.

### Fenêtre widget

- Créée au runtime (pas déclarée en dur dans `tauri.conf.json` car conditionnelle).
- Charge `widget.html` (entrée Vite dédiée ajoutée à `build.rollupOptions.input`).

### Capabilities (`src-tauri/capabilities/`)

- Nouvelle capability `widget.json` ciblant `["widget"]` : permissions SQL (comme
  `main`), `core:window:allow-start-dragging` (poignée), permissions `autostart`.

## Découpage des unités

- `src/widget/` — entrée + vue React mince du widget (indépendante de `App`).
- `src/store/settings.ts` — ajout `widgetEnabled` + `widgetView` (patron existant).
- `src/db/repository.ts` — émission centralisée de `tasks-changed`.
- `src-tauri/src/lib.rs` (+ éventuel module `widget.rs`) — commandes NSPanel, tray,
  activation policy, window events.
- `src-tauri/capabilities/widget.json` — permissions de la fenêtre widget.

## Points hors périmètre (YAGNI pour l'instant)

- Redimensionnement du widget.
- Thèmes/personnalisation avancée du widget.
- Support Windows/Linux du comportement « niveau bureau » (spécifique macOS ; le reste
  peut dégrader proprement).

## Tests

- Store : `widgetEnabled` / `widgetView` persistés et rechargés (suivre
  `settings.test.ts`).
- Vue widget : rendu de la liste, cochage appelle `completeTask`/`uncompleteTask`,
  changement de vue via le sélecteur.
- Réactivité : émission de `tasks-changed` sur mutation (mock de l'API Tauri `event`).
- Le comportement natif macOS (NSPanel, Dock, autostart) se vérifie manuellement.

## Changelog

Fonctionnalité visible par l'utilisateur → entrée à ajouter dans
`src/assets/changelog.json` (section `Unreleased`, catégorie `features`, bilingue) lors
de l'implémentation.
