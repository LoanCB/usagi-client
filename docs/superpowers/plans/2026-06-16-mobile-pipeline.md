# Mobile CI/CD Pipeline — iOS & Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une pipeline GitHub Actions qui build et publie Bunly sur iOS et Android à chaque tag `v*`, en parallèle de la pipeline desktop existante.

**Architecture:** Un nouveau fichier `.github/workflows/release-mobile.yml` avec trois jobs indépendants : `build-android` (ubuntu), `build-ios` (macOS, continue-on-error), et `release-mobile` qui attache les artifacts à la GitHub Release via `gh release upload`. L'updater Tauri est conditionalisé à la compilation desktop via les cfg Rust natifs de Tauri (`#[cfg(desktop)]`).

**Tech Stack:** Tauri v2 CLI (`tauri android build`, `tauri ios build`), GitHub Actions, JDK 17 (temurin), Android SDK/NDK (pré-installé sur ubuntu-latest), Xcode (pré-installé sur macos-latest), Rust target toolchains Android, `keytool` (JDK), `gh` CLI

---

## Fichiers touchés

| Fichier                                      | Action                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `src-tauri/Cargo.toml`                       | Modifier — conditionner `tauri-plugin-updater` sur `cfg(desktop)` |
| `src-tauri/src/lib.rs`                       | Modifier — conditionner `.plugin(updater)` sur `#[cfg(desktop)]`  |
| `src-tauri/gen/apple/`                       | Créer — généré par `tauri ios init` (à commiter)                  |
| `src-tauri/gen/android/`                     | Créer — généré par `tauri android init` (à commiter)              |
| `src-tauri/gen/android/app/build.gradle.kts` | Modifier après init — ajouter signing config depuis env vars      |
| `.github/workflows/release-mobile.yml`       | Créer — workflow de build mobile                                  |

---

## Task 1 : Conditionner l'updater Tauri sur desktop uniquement

**Fichiers :**

- Modifier : `src-tauri/Cargo.toml`
- Modifier : `src-tauri/src/lib.rs`

- [ ] **Étape 1 : Mettre à jour Cargo.toml**

Dans `src-tauri/Cargo.toml`, remplacer la ligne :

```toml
tauri-plugin-updater = "2"
```

par une section conditionnelle à ajouter **après** le bloc `[dependencies]` existant :

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
```

Le fichier doit ressembler à ceci en fin de fichier (après la section `[target.'cfg(target_os = "macos")'.dependencies]` existante) :

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
```

- [ ] **Étape 2 : Conditionner le plugin dans lib.rs**

Dans `src-tauri/src/lib.rs`, la fonction `run()` utilise un builder chain. Transformer les lignes 33-45 en scindant le builder pour pouvoir conditionner l'updater :

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![send_app_notification])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Note : `#[cfg(desktop)]` est un cfg flag fourni automatiquement par `tauri-build` — plus lisible que `cfg(not(any(target_os = "android", target_os = "ios")))`.

- [ ] **Étape 3 : Vérifier que le code compile**

```bash
cd src-tauri && cargo check
```

Attendu : `Finished checking` sans erreurs. Si `tauri_plugin_updater` génère une erreur "not found", vérifier que la section `[target.'cfg(...)'.dependencies]` est bien en dehors du bloc `[dependencies]` principal.

---

## Task 2 : Initialiser les projets mobiles Tauri

**Contexte :** Ces commandes génèrent les projets natifs Xcode et Gradle dans `src-tauri/gen/`. Ces fichiers doivent être commités pour que la CI puisse les utiliser. Le `.gitignore` de `src-tauri/` ignore déjà `/gen/schemas` mais **pas** `gen/apple` ni `gen/android`.

**Prérequis locaux :**

- `tauri ios init` → nécessite macOS + Xcode installé
- `tauri android init` → nécessite Android SDK (`ANDROID_HOME` défini)

- [ ] **Étape 1 : Initialiser le projet iOS** _(macOS uniquement)_

```bash
pnpm tauri ios init
```

Attendu : création de `src-tauri/gen/apple/` contenant un projet Xcode (`.xcodeproj`, `Info.plist`, etc.). Si la commande échoue faute de Xcode, passer directement à l'étape Android — le dossier `gen/apple` sera créé plus tard.

- [ ] **Étape 2 : Initialiser le projet Android**

```bash
pnpm tauri android init
```

Attendu : création de `src-tauri/gen/android/` contenant un projet Gradle (`settings.gradle`, `app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, etc.).

- [ ] **Étape 3 : Vérifier les dossiers générés**

```bash
ls src-tauri/gen/
```

Attendu : `android/` et `apple/` (ou juste `android/` si iOS skippé) en plus de `schemas/`.

- [ ] **Étape 4 : Vérifier que git trackera les nouveaux dossiers**

```bash
git status src-tauri/gen/
```

`gen/apple/` et `gen/android/` doivent apparaître comme "Untracked files". Si `gen/android` ou `gen/apple` n'apparaissent pas, vérifier `src-tauri/.gitignore` — il ne doit ignorer que `/gen/schemas`.

---

## Task 3 : Créer le keystore Android et configurer le signing Gradle

**Contexte :** Le signing Android se configure dans `gen/android/app/build.gradle.kts` (généré à la Task 2). On lit les credentials depuis des variables d'environnement pour éviter de stocker des secrets dans le code.

- [ ] **Étape 1 : Créer le keystore en local**

```bash
keytool -genkey -v \
  -keystore bunly-release.keystore \
  -alias bunly \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Remplir les informations demandées (nom, organisation, pays). Noter l'alias (`bunly`), le mot de passe du keystore et le mot de passe de la clé.

- [ ] **Étape 2 : Ajouter le keystore au .gitignore racine**

Ajouter au `.gitignore` racine du repo :

```
bunly-release.keystore
*.keystore
*.jks
```

- [ ] **Étape 3 : Encoder le keystore en base64 pour GitHub Secrets**

```bash
base64 -i bunly-release.keystore | pbcopy   # macOS — copie dans le presse-papiers
```

- [ ] **Étape 4 : Créer les 4 secrets GitHub** _(action manuelle sur github.com)_

Aller dans `Settings → Secrets and variables → Actions → New repository secret` et créer :

| Nom du secret            | Valeur                               |
| ------------------------ | ------------------------------------ |
| `ANDROID_KEYSTORE`       | Contenu base64 du keystore (étape 3) |
| `ANDROID_KEY_ALIAS`      | `bunly`                              |
| `ANDROID_KEY_PASSWORD`   | Mot de passe de la clé               |
| `ANDROID_STORE_PASSWORD` | Mot de passe du keystore             |

- [ ] **Étape 5 : Ajouter le signing config dans build.gradle.kts**

Ouvrir `src-tauri/gen/android/app/build.gradle.kts`. Trouver le bloc `android {` et ajouter le signing config **avant** le bloc `buildTypes` existant :

```kotlin
android {
    // ... configuration existante ...

    signingConfigs {
        create("release") {
            storeFile = System.getenv("ANDROID_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("ANDROID_STORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            // ... config existante du release build type ...
        }
    }
}
```

Note : Si `buildTypes` contient déjà une entrée `getByName("release")`, ajouter seulement la ligne `signingConfig = signingConfigs.getByName("release")` à l'intérieur.

---

## Task 4 : Créer le workflow release-mobile.yml

**Fichiers :**

- Créer : `.github/workflows/release-mobile.yml`

- [ ] **Étape 1 : Créer le fichier workflow**

Créer `.github/workflows/release-mobile.yml` avec le contenu suivant :

```yaml
name: Release Mobile

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build-android:
    name: Build Android
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: "17"
          distribution: temurin

      - uses: pnpm/action-setup@v4
        with:
          version: 10.12.1

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install Android NDK
        run: |
          echo "y" | $ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager "ndk;27.0.12077973"
          echo "NDK_HOME=$ANDROID_SDK_ROOT/ndk/27.0.12077973" >> $GITHUB_ENV

      - name: Decode Android keystore
        env:
          ANDROID_KEYSTORE: ${{ secrets.ANDROID_KEYSTORE }}
        run: |
          echo "$ANDROID_KEYSTORE" | base64 -d > /tmp/bunly-release.keystore
          echo "ANDROID_KEYSTORE_PATH=/tmp/bunly-release.keystore" >> $GITHUB_ENV

      - run: pnpm install --frozen-lockfile

      - name: Build Android APK (sideload)
        env:
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          ANDROID_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
        run: pnpm tauri android build

      - name: Build Android AAB (Play Store)
        env:
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          ANDROID_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
        run: |
          cd src-tauri/gen/android
          ./gradlew bundleUniversalRelease
        # Note : si le nom de la task Gradle diffère (ex: bundleReleaseUniversalApk),
        # vérifier avec : cd src-tauri/gen/android && ./gradlew tasks --all | grep -i bundle

      - name: Upload Android artifacts
        uses: actions/upload-artifact@v4
        with:
          name: bunly-android
          path: |
            src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
            src-tauri/gen/android/app/build/outputs/bundle/universalRelease/*.aab
          if-no-files-found: warn

  build-ios:
    name: Build iOS (unsigned)
    runs-on: macos-latest
    continue-on-error: true
    # iOS signing non configuré — nécessite un compte Apple Developer.
    # Secrets à ajouter quand disponibles :
    #   APPLE_CERTIFICATE          — certificat distribution P12 en base64
    #   APPLE_CERTIFICATE_PASSWORD — mot de passe du certificat P12
    #   APPLE_PROVISIONING_PROFILE — profil de provisionnement en base64
    #   APPLE_TEAM_ID              — Team ID Apple Developer (ex: ABCD1234EF)

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.12.1

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-ios,aarch64-apple-ios-sim,x86_64-apple-ios

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - run: pnpm install --frozen-lockfile

      - name: Build iOS (unsigned)
        run: pnpm tauri ios build --export-method development

      - name: Upload iOS artifact
        uses: actions/upload-artifact@v4
        with:
          name: bunly-ios
          path: src-tauri/gen/apple/build/arm64/*.ipa
          if-no-files-found: warn

  release-mobile:
    name: Attach mobile artifacts to release
    needs: [build-android, build-ios]
    runs-on: ubuntu-latest
    if: always()

    steps:
      - name: Download all mobile artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: List artifacts
        run: find artifacts -type f | sort

      - name: Wait for GitHub Release and upload artifacts
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ github.ref_name }}
          GH_REPO: ${{ github.repository }}
        run: |
          for i in $(seq 1 5); do
            if gh release view "$TAG" --repo "$GH_REPO" &>/dev/null; then
              echo "Release $TAG found — uploading mobile artifacts"
              find artifacts -type f | xargs gh release upload "$TAG" --repo "$GH_REPO" --clobber
              echo "Upload complete"
              exit 0
            fi
            echo "Attempt $i/5: release $TAG not found yet, waiting 30s..."
            sleep 30
          done
          echo "::error::Release $TAG not found after 5 attempts — desktop pipeline may have failed"
          exit 1
```

- [ ] **Étape 2 : Valider la syntaxe YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-mobile.yml'))" && echo "YAML valide"
```

Attendu : `YAML valide`. Si erreur de parsing, corriger l'indentation signalée.

---

## Task 5 : Vérification locale du build Rust modifié

- [ ] **Étape 1 : Vérifier la compilation desktop**

```bash
cd src-tauri && cargo check --target x86_64-apple-darwin
```

Attendu : `Finished checking` — `tauri-plugin-updater` doit être inclus pour la target desktop.

- [ ] **Étape 2 : Vérifier que l'updater est bien exclu pour Android**

```bash
cd src-tauri && cargo check --target aarch64-linux-android
```

Attendu : `Finished checking` sans erreur. `tauri-plugin-updater` ne doit **pas** apparaître dans les dépendances résolues.

Note : La target `aarch64-linux-android` doit être installée : `rustup target add aarch64-linux-android`.

- [ ] **Étape 3 : Vérifier que le build frontend passe toujours**

```bash
pnpm build
```

Attendu : `vite build` se termine sans erreur.

---

## Notes post-implémentation

### Activer le signing iOS (quand le compte Apple Developer est disponible)

1. Dans `.github/workflows/release-mobile.yml`, job `build-ios`, ajouter après l'étape `pnpm install` :

```yaml
- name: Import Apple certificate
  env:
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  run: |
    echo "$APPLE_CERTIFICATE" | base64 -d > /tmp/certificate.p12
    security create-keychain -p "" build.keychain
    security import /tmp/certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -A
    security list-keychains -s build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "" build.keychain

- name: Install provisioning profile
  env:
    APPLE_PROVISIONING_PROFILE: ${{ secrets.APPLE_PROVISIONING_PROFILE }}
  run: |
    mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
    echo "$APPLE_PROVISIONING_PROFILE" | base64 -d > ~/Library/MobileDevice/Provisioning\ Profiles/profile.mobileprovision
```

2. Mettre à jour la commande de build :

```yaml
run: pnpm tauri ios build --export-method app-store-connect
```

3. Supprimer `continue-on-error: true` du job `build-ios`.

### Versions NDK

La version NDK `27.0.12077973` était stable au 2026-06-16. Si le build Android échoue avec une erreur NDK, vérifier les versions disponibles sur le runner :

```bash
ls $ANDROID_SDK_ROOT/ndk/
```

Et mettre à jour la version dans le workflow.
