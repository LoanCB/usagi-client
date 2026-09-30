# Mobile CI/CD Pipeline — iOS & Android

date: 2026-06-16 | status: approved

## Contexte général

Bunly est une application Tauri v2 avec une pipeline de release existante pour desktop (macOS arm64, Windows x64, Linux x64) dans `.github/workflows/release.yml`. L'objectif est d'ajouter des builds iOS et Android à la pipeline.

### Décisions de design

| Question | Décision |
| --- | --- |
| Distribution | App Store + Play Store ET sideload (APK/IPA) |
| Updater sur mobile | Désactivé par plateforme (stores gèrent les mises à jour) |
| Signing iOS | Build non-signé pour l'instant (pas de compte Apple Developer) |
| Signing Android | Keystore à créer ; secrets GitHub configurés |

### Architecture

#### Nouveau fichier : `.github/workflows/release-mobile.yml`

Déclenché sur les mêmes tags `v*` que la pipeline desktop. Contient trois jobs :

1. **`build-android`** — runner `ubuntu-latest`
   - Installe JDK 17, Android SDK, Android NDK
   - Décode le keystore depuis `secrets.ANDROID_KEYSTORE` (base64)
   - Exécute `pnpm tauri android build --apk` (sideload)
   - Exécute `pnpm tauri android build --aab` (Play Store)
   - Upload les artifacts APK et AAB

2. **`build-ios`** — runner `macos-latest`, `continue-on-error: true`
   - Installe Xcode via runner par défaut
   - Exécute `pnpm tauri ios build` sans signing (mode development non-signé)
   - Upload l'IPA pour sideload
   - Commentaire inline documentant les secrets Apple à ajouter ultérieurement

3. **`release-mobile`** — dépend de `build-android` et `build-ios`
   - Télécharge tous les artifacts mobiles
   - Utilise `gh release upload` pour attacher les artifacts à la GitHub Release du tag courant
   - Attend que la release existe (la pipeline desktop la crée) via un retry limité (max 5 tentatives, 30s d'intervalle)

#### Fichier existant : `.github/workflows/release.yml`

Aucune modification. Les jobs desktop restent inchangés.

### Configuration platform-specific de l'updater

#### `src-tauri/Cargo.toml`

Remplacer la dépendance inconditionnelle `tauri-plugin-updater` par :

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
```

#### `src-tauri/src/lib.rs`

Entourer l'enregistrement du plugin updater avec :

```rust
#[cfg(not(any(target_os = "android", target_os = "ios")))]
.plugin(tauri_plugin_updater::Builder::new().build())
```

### Initialisation des projets mobiles Tauri

À exécuter une fois en local avant de pusher :

```bash
pnpm tauri ios init
pnpm tauri android init
```

Les répertoires générés à commiter :

- `src-tauri/gen/apple/` — projet Xcode
- `src-tauri/gen/android/` — projet Gradle

### Secrets GitHub à configurer

#### Android (requis)

| Secret | Valeur |
| --- | --- |
| `ANDROID_KEYSTORE` | Keystore encodé en base64 |
| `ANDROID_KEY_ALIAS` | Alias de la clé dans le keystore |
| `ANDROID_KEY_PASSWORD` | Mot de passe de la clé |
| `ANDROID_STORE_PASSWORD` | Mot de passe du keystore |

#### iOS (à configurer quand le compte Apple Developer est disponible)

| Secret | Valeur |
| --- | --- |
| `APPLE_CERTIFICATE` | Certificat de distribution encodé en base64 |
| `APPLE_CERTIFICATE_PASSWORD` | Mot de passe du certificat |
| `APPLE_PROVISIONING_PROFILE` | Profil de provisionnement en base64 |
| `APPLE_TEAM_ID` | Team ID Apple Developer |

### Création du keystore Android

À exécuter une fois en local :

```bash
keytool -genkey -v \
  -keystore bunly-release.keystore \
  -alias bunly \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Puis encoder en base64 pour le secret GitHub :

```bash
base64 -i bunly-release.keystore | pbcopy  # macOS
```

**Important** : ne jamais commiter le fichier `.keystore` dans le repo.

### Artifacts produits

| Plateforme | Format | Usage |
| --- | --- | --- |
| Android | `.apk` | Sideload / tests |
| Android | `.aab` | Google Play Store |
| iOS | `.ipa` | Sideload (non-signé pour l'instant) |

### Critères de succès

- La pipeline desktop (`release.yml`) continue de fonctionner sans modification
- Un tag `v*` déclenche les deux pipelines en parallèle
- Les builds Android (APK + AAB) signés sont attachés à la GitHub Release
- Le build iOS non-signé est attaché à la GitHub Release avec `continue-on-error: true`
- L'updater Tauri ne compile pas sur les cibles Android et iOS
