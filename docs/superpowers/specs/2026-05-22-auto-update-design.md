# Auto-update in-app — Design Spec

**Date:** 2026-05-22  
**Repo:** LoanCB/usagi-client  
**App:** Bunly (Tauri v2)

## Objectif

Permettre à l'app de détecter, notifier et installer une nouvelle version automatiquement, via un banner persistant et un bouton manuel dans les paramètres.

---

## Architecture globale

```
App startup
    └─> useEffect in App.tsx
            └─> check_for_updates() [Tauri command]
                    └─> tauri-plugin-updater → fetch latest.json
                            ├─ Pas de mise à jour → rien
                            └─ Nouvelle version trouvée → frontend event
                                    └─> UpdateBanner affiché
                                            └─> Clic "Mettre à jour"
                                                    └─> Téléchargement (progress events)
                                                            └─> Installation + redémarrage
```

### Flux manuel (SettingsDialog)

- L'utilisateur clique "Vérifier les mises à jour" dans les paramètres
- Même logique que le check au démarrage, avec un feedback "Vous êtes à jour" si rien de nouveau

---

## Modifications GitHub Action (`release.yml`)

### Secrets GitHub à créer

- `TAURI_SIGNING_PRIVATE_KEY` — clé privée, générée avec `tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — mot de passe associé (peut être vide)

### Changements dans le job `build`

1. Exposer `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en variables d'env — Tauri génère automatiquement les `.sig` lors du build
2. Ajouter les fichiers `.sig` dans les artifacts uploadés

### Nouveau job `create-updater-manifest`

- Dépend de `build`
- Télécharge tous les artifacts
- Exécute un script Node/bash qui :
  - Lit les fichiers `.sig`
  - Construit `latest.json` avec la version (extraite du tag git), la date, les URLs de download GitHub et les signatures par plateforme
  - Uploade `latest.json` comme artifact

### Changements dans le job `release`

- Télécharge également l'artifact `updater-manifest`
- Inclut `latest.json` dans les assets de la GitHub Release

### Format `latest.json`

```json
{
  "version": "1.0.0",
  "notes": "...",
  "pub_date": "2026-01-01T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/LoanCB/usagi-client/releases/download/v1.0.0/Bunly_1.0.0_aarch64.app.tar.gz",
      "signature": "<contenu du .sig>"
    },
    "linux-x86_64": {
      "url": "https://github.com/LoanCB/usagi-client/releases/download/v1.0.0/bunly_1.0.0_amd64.AppImage.tar.gz",
      "signature": "<contenu du .sig>"
    },
    "windows-x86_64": {
      "url": "https://github.com/LoanCB/usagi-client/releases/download/v1.0.0/Bunly_1.0.0_x64-setup.exe",
      "signature": "<contenu du .sig>"
    }
  }
}
```

**Endpoint final dans `tauri.conf.json` :**

```
https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json
```

Cette URL pointe toujours vers la dernière release stable — aucune mise à jour nécessaire entre versions.

---

## Configuration Tauri

### `src-tauri/Cargo.toml`

```toml
tauri-plugin-updater = "2"
```

### `src-tauri/src/lib.rs`

- Enregistrer `.plugin(tauri_plugin_updater::Builder::new().build())`
- Exposer une commande `check_for_updates` qui retourne les métadonnées de la mise à jour disponible (version, notes) ou `None`

### `src-tauri/tauri.conf.json`

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<clé publique générée avec tauri signer>",
      "endpoints": [
        "https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json"
      ]
    }
  }
}
```

### Capabilities

Ajouter la permission `updater:default` dans le fichier de capabilities approprié pour autoriser le frontend à appeler le plugin.

### `package.json`

```
@tauri-apps/plugin-updater
```

---

## Frontend

### `src/hooks/useUpdater.ts`

Hook qui centralise la logique de mise à jour :

- `checkForUpdate()` — appelle le plugin updater, retourne les infos ou null
- `downloadAndInstall()` — démarre le téléchargement, émet des events de progression
- État exposé : `{ update, status: 'idle' | 'available' | 'downloading' | 'ready', progress }`
- Appelé au montage dans `App.tsx` (check silencieux au démarrage)

### `src/components/layout/UpdateBanner.tsx`

Banner fixe en bas de l'écran, 3 états :

**État 1 — Update disponible**

```
┌─────────────────────────────────────────────────────────────┐
│  ↑  Bunly v1.2.0 est disponible     [Plus tard]  [Mettre à jour]  │
└─────────────────────────────────────────────────────────────┘
```

**État 2 — Téléchargement en cours**

```
┌─────────────────────────────────────────────────────────────┐
│  ⟳  Téléchargement... ████████░░░░  67%                          │
└─────────────────────────────────────────────────────────────┘
```

**État 3 — Prêt à redémarrer**

```
┌─────────────────────────────────────────────────────────────┐
│  ✓  Mise à jour installée            [Redémarrer maintenant]      │
└─────────────────────────────────────────────────────────────┘
```

- "Plus tard" : ferme le banner pour la session (pas persisté — réapparaît au prochain démarrage si non installée)
- "Redémarrer maintenant" : appelle `relaunch()` de `@tauri-apps/plugin-process`

### `src/components/layout/SettingsDialog.tsx`

- Ajouter une section "À propos" ou "Application" avec :
  - Version actuelle de l'app (lue via `getVersion()` de `@tauri-apps/api/app`)
  - Bouton "Vérifier les mises à jour" qui appelle `checkForUpdate()` du hook
  - Feedback inline : "Vous êtes à jour" ou redirection vers le banner si update trouvée

### `src/App.tsx`

- Monter `<UpdateBanner />` dans le layout racine
- Appel initial à `checkForUpdate()` dans un `useEffect` au premier rendu

---

## Gestion d'erreurs

- Si le fetch de `latest.json` échoue (réseau absent, rate limit GitHub) : silencieux — pas de banner, pas de crash
- Si le téléchargement échoue : banner passe en état d'erreur avec message "Réessayer"
- En mode dev (`tauri::is_dev()`) : le check est désactivé pour éviter les faux positifs

---

## Prérequis avant première release avec update

1. Générer la paire de clés : `pnpm tauri signer generate -w ~/.tauri/bunly.key`
2. Ajouter `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` dans les secrets GitHub Actions
3. Copier la clé publique dans `tauri.conf.json`
4. Merger ce feature branch et créer un tag `v*` pour déclencher le workflow

---

## Non inclus dans ce scope

- Mises à jour différentielles (delta patches)
- Mises à jour silencieuses automatiques sans interaction utilisateur
- Rollback vers une version précédente
- Canal beta/stable distinct dans l'endpoint updater (la distinction beta/stable existante dans le workflow suffit pour l'instant)
