# Installation native des mises à jour bêta

**Date :** 2026-06-23
**Statut :** Validé, prêt pour planification
**Contexte antérieur :** [2026-06-17-beta-release-channel-design.md](2026-06-17-beta-release-channel-design.md) (mise en place initiale du canal bêta)

## Problème

Le canal bêta détecte les mises à jour mais ne sait pas les **installer**. Le bandeau propose seulement un bouton « Voir sur GitHub » qui ouvre la page des releases — l'utilisateur doit télécharger et installer manuellement, alors que le canal stable installe en un clic.

Deux causes techniques :

1. **L'API JS `check()` du plugin updater ne permet pas de changer d'endpoint** — seulement d'ajouter des headers. L'endpoint est figé dans `tauri.conf.json` (manifeste stable). Le canal bêta a donc été implémenté par un `fetch` manuel vers le manifeste bêta, qui ne produit pas d'objet `Update` installable.
2. **Le `fetch` du webview était bloqué** (CORS + CSP sur la redirection GitHub→CDN). Corrigé en amont par l'ajout du plugin HTTP natif Tauri ; le check bêta fonctionne désormais (détection OK).

Bug connexe observé : au démarrage, le bandeau affiche **deux** mises à jour empilées (stable v26.2.0 *et* bêta9). `betaChannel` se charge de façon asynchrone depuis SQLite, donc l'effet de vérification se déclenche deux fois (d'abord `stable` avec la valeur par défaut, puis `beta`), et les deux `check` asynchrones interfèrent sur l'état du hook.

## Objectif

Installer une mise à jour bêta directement depuis le bandeau, exactement comme le canal stable (téléchargement signé + barre de progression + redémarrage), et corriger le double-bandeau.

## Approche retenue (Option A)

Déporter la vérification et l'installation côté **Rust**, où `UpdaterExt::updater_builder().endpoints(...)` accepte un endpoint à l'exécution. Deux commandes Tauri custom, paramétrées par endpoint, partagées par les canaux stable et bêta. Le front ne dépend plus du plugin updater JS ni d'un `fetch` manuel.

### Comportement de canal

« Bêta + stable, bêta prioritaire » :
- Canal bêta activé → on vérifie **les deux** endpoints et on propose la version la plus récente (à version de base égale, le stable gagne).
- Canal bêta désactivé → seulement le stable.
- Un seul résultat de mise à jour en sortie → **un seul bandeau** (le double-bandeau disparaît par construction).

## Architecture

### Rust — nouvelle unité `src-tauri/src/updater.rs`

Enregistrée dans `lib.rs`, dans le bloc `#[cfg(desktop)]` existant (à côté de `tauri_plugin_updater` / `tauri_plugin_process` / `tauri_plugin_http`).

```rust
#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
}

#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    endpoints: Vec<String>,
) -> Result<Option<UpdateInfo>, String>
```

- Parse les `endpoints` en `Url`, construit l'updater via `app.updater_builder().endpoints(urls)?.build()?`, appelle `.check().await`.
- Renvoie `Some(UpdateInfo)` si une mise à jour est disponible, `None` sinon. Erreurs converties en `String`.
- L'objet `Update` natif **n'est pas sérialisable** et ne traverse pas le pont JS — le check ne renvoie que les métadonnées.

```rust
#[tauri::command]
async fn install_update(
    app: tauri::AppHandle,
    endpoints: Vec<String>,
    on_event: tauri::ipc::Channel<DownloadEvent>,
) -> Result<(), String>
```

- Reconstruit l'updater avec le(s) même(s) endpoint(s), refait `.check()` (pattern recommandé par Tauri pour un endpoint dynamique : l'`Update` ne peut être recréé que par un check côté Rust).
- Appelle `update.download_and_install(progress_cb, finished_cb)`.
- Streame la progression au front via `Channel<DownloadEvent>` : événements `Started { content_length }`, `Progress { chunk_length }`, `Finished` — mêmes sémantiques que l'ancien `downloadAndInstall` JS.

La pubkey de `tauri.conf.json` est héritée par `updater_builder()`. La vérification de signature minisign des artefacts bêta fonctionne donc sans configuration supplémentaire (confirmé : le workflow CI signe tous les artefacts — bêta inclus — avec le même secret `TAURI_SIGNING_PRIVATE_KEY`, et `latest-beta.json` embarque les signatures).

### Front — refonte de `src/hooks/useUpdater.ts`

Ne dépend plus de `@tauri-apps/plugin-updater` ni d'un `fetch` manuel. Parle uniquement aux deux commandes Rust via `invoke` / `Channel`.

Constantes d'endpoint :
```ts
const STABLE_ENDPOINT = "https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json";
const BETA_ENDPOINT   = "https://github.com/LoanCB/usagi-client/releases/download/latest-beta/latest-beta.json";
```

État unifié (remplace `update: Update | null` + `betaVersion: string | null`) :
```ts
interface AvailableUpdate { version: string; isBeta: boolean; }
// state : status, available: AvailableUpdate | null, progress, error
```

`checkForUpdate(betaEnabled: boolean)` :
1. `betaEnabled` vrai → `check_update([BETA])` et `check_update([STABLE])` en parallèle ; sinon `check_update([STABLE])` seul.
2. Sélection « bêta prioritaire » **sans comparaison de versions** : si le canal bêta renvoie une mise à jour, on la retient ; sinon, si le stable en renvoie une, on la retient. Rust a déjà jugé « plus récent que la version installée » pour chacun, donc tout résultat non-nul est par définition une mise à jour valide à proposer. La priorité bêta tranche les cas où les deux répondent — **pas besoin de comparer les chaînes de version entre elles**.

   > **Pourquoi pas de comparaison TS :** les deux manifestes utilisent des formats de version volontairement différents et non comparables — le stable contient une version manglée pour WiX (année tronquée, ex. `26.2.0`) tandis que le bêta contient le CalVer complet (ex. `2026.1.1-beta9`). Une comparaison numérique naïve ferait perdre le stable à tort (`26 < 2026`). La règle « bêta prioritaire » évite entièrement ce piège. La fonction `isNewer` maison est donc **supprimée** (ainsi que ses tests dédiés).
3. Produit un seul `available`.
4. Conserve le garde `import.meta.env.MODE !== "production"` et le reset d'état en début de check.

`downloadAndInstall()` : appelle `install_update([endpoint du canal retenu], channel)`, mappe les events du `Channel` sur `progress` / `status`. `relaunchApp()` et `dismiss()` inchangés.

### Front — `src/components/layout/UpdateBanner.tsx`

Un seul bloc `available` (plus deux blocs concurrents) :

```
↑  <texte version>    [Plus tard]  [Mettre à jour]
```

- Flèche/pastille **ambre si `isBeta`**, primaire sinon.
- Texte : `isBeta` → clé `betaUpdateAvailable` ; stable → nouvelle clé `updateAvailable` (remplace la chaîne codée en dur `Bunly v{update.version} est disponible`).
- Bouton « Voir sur GitHub » **supprimé**, remplacé par « Mettre à jour » → `downloadAndInstall()`.
- États `downloading` / `ready` / `error` inchangés ; ils fonctionnent désormais aussi pour la bêta (chemin unique).
- Suppression de la constante `BETA_RELEASE_PAGE` et du lien externe.

### i18n

- **Ajout** : `updateAvailable` → fr « Bunly v{{version}} est disponible » / en « Bunly v{{version}} is available ».
- **Suppression** : `betaViewOnGitHub` (fr.ts, en.ts) — plus utilisée.
- `betaUpdateAvailable`, `dismissLater` : conservées.

### Dépendances

- **Garder** le crate Rust `tauri-plugin-http` + la permission `http:default` scopée (nécessaires à reqwest pour suivre les redirections GitHub→CDN lors du check/download natifs).
- **Retirer** la dépendance JS `@tauri-apps/plugin-http` (le front n'effectue plus de fetch).

## Flux de données

1. Démarrage (`App.tsx`) : `checkForUpdate(betaChannel)`.
2. Hook → `invoke("check_update", { endpoints })` (1 ou 2 appels selon le canal).
3. Rust : `updater_builder().endpoints(...).check()` → `UpdateInfo | null`.
4. Hook : sélectionne la meilleure version → `available` → bandeau (un seul bloc).
5. Clic « Mettre à jour » → `invoke("install_update", { endpoints, onEvent: channel })`.
6. Rust : re-check + `download_and_install`, émet `Started/Progress/Finished` sur le `Channel`.
7. Hook : `progress` / `status: "ready"` → bouton « Redémarrer maintenant » → `relaunch()`.

## Gestion des erreurs

- Échec réseau / parse endpoint / signature invalide → la commande Rust renvoie `Err(String)` ; le hook passe en `status: "error"` avec le message ; le bandeau affiche l'erreur + bouton « Réessayer ».
- Pas de mise à jour disponible (404 du manifeste bêta non publié, ou version courante à jour) → `Ok(None)` → `status: "idle"`, pas d'erreur.

## Tests

- `useUpdater.test.ts` réécrit : mocke `invoke` (commandes Rust) au lieu du plugin updater + plugin-http. Cas : bêta prioritaire sur stable, stable seul quand bêta off, aucun update → idle, erreur → status error, progression download → ready.
- `UpdateBanner.test.tsx` : un seul bloc rendu ; « Mettre à jour » déclenche l'install ; absence de lien GitHub.
- Vérifications de build : `vitest run`, `tsc --noEmit`, `cargo build`.

## Validation manuelle

Le check ne tourne qu'en production. Valider via `pnpm tauri build` puis installation de l'AppImage : canal bêta coché → « Mettre à jour » télécharge et installe la bêta, barre de progression, redémarrage. La version locale étant `0.1.0`, toute bêta publiée sera proposée.

## Hors périmètre

- Refonte esthétique globale du bandeau (au-delà de l'unification en un bloc).
- Centralisation de la logique de canal en Rust (Option C écartée : garde les tests TS existants de `isNewer`).
- Plateformes non-desktop (le check est desktop-only).
