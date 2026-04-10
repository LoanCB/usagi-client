# Usagi

Application de gestion de tâches locale, cross-platform (Linux · macOS · Windows), construite avec Tauri 2.

Données stockées localement dans SQLite. Architecture prête pour une synchronisation multi-device via ElectricSQL (phase 2).

---

## Fonctionnalités

- **Projets** — organisez vos tâches par projet (couleur, icône)
- **Smart lists** — Inbox, Aujourd'hui, Toutes les tâches
- **Tâches** — titre, priorité (aucune / basse / moyenne / haute), date d'échéance, tags
- **Filtre** — par priorité, par statut (complétées), réinitialisation en un clic
- **Détail de tâche** — édition inline du titre, sélecteur de priorité, date, tags, suppression
- **Thème** — clair / sombre / système, extensible via fichiers JSON
- **Sidebar rétractable** — mode icônes pour maximiser l'espace

---

## Stack technique

| Couche          | Technologie                           |
| --------------- | ------------------------------------- |
| Shell natif     | Tauri 2 (Rust)                        |
| UI              | React 19 + TypeScript                 |
| Composants      | shadcn/ui (Base UI + Tailwind CSS v4) |
| État            | Zustand                               |
| Base de données | SQLite via `tauri-plugin-sql`         |
| Tests           | Vitest + @testing-library/react       |

---

## Prérequis

### Rust

Tauri nécessite la toolchain Rust. Installez-la via [rustup](https://rustup.rs) :

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Dépendances système

**Linux (Debian / Ubuntu)**

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**macOS** — installez les Command Line Tools :

```bash
xcode-select --install
```

**Windows** — assurez-vous qu'[Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) est installé (inclus par défaut sur Windows 10 1803+ et Windows 11).

### Node.js et pnpm

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 9

```bash
npm install -g pnpm
```

---

## Installation (développement)

```bash
# Cloner le dépôt
git clone <url-du-repo>
cd usagi

# Installer les dépendances JavaScript
pnpm install
```

### Lancer en mode développement

```bash
pnpm tauri dev
```

Cela démarre le serveur Vite (`localhost:1420`) et ouvre la fenêtre Tauri avec rechargement à chaud.

### Lancer les tests

```bash
pnpm run test:run      # passage unique
pnpm run test          # mode watch
```

### Vérification TypeScript

```bash
pnpm run build         # tsc + vite build (sans la partie Rust)
```

---

## Construire et installer le client lourd

### Compiler l'application

```bash
pnpm tauri build
```

Cette commande :

1. compile le frontend React (`vite build`)
2. compile le binaire Rust
3. génère les installateurs natifs pour la plateforme courante

Les artefacts sont produits dans `src-tauri/target/release/bundle/`.

### Installateurs générés par plateforme

| Plateforme | Format        | Emplacement        |
| ---------- | ------------- | ------------------ |
| Linux      | `.deb`        | `bundle/deb/`      |
| Linux      | `.AppImage`   | `bundle/appimage/` |
| macOS      | `.dmg`        | `bundle/dmg/`      |
| macOS      | `.app`        | `bundle/macos/`    |
| Windows    | `.msi`        | `bundle/msi/`      |
| Windows    | `.exe` (NSIS) | `bundle/nsis/`     |

### Installation

**Linux — paquet Debian**

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/usagi_0.1.0_amd64.deb
```

**Linux — AppImage** (portable, aucune installation)

```bash
chmod +x src-tauri/target/release/bundle/appimage/usagi_0.1.0_amd64.AppImage
./src-tauri/target/release/bundle/appimage/usagi_0.1.0_amd64.AppImage
```

**macOS** — ouvrez le `.dmg`, faites glisser `usagi.app` dans `/Applications`.

**Windows** — exécutez le `.msi` ou le `.exe` NSIS et suivez l'assistant d'installation.

---

## Structure du projet

```text
usagi/
├── src/                        # Frontend React + TypeScript
│   ├── components/
│   │   ├── layout/             # AppShell, Sidebar, TaskList, TaskDetail
│   │   ├── tasks/              # TaskItem, TaskForm, FilterBar, sélecteurs
│   │   └── ui/                 # Composants shadcn/ui (générés)
│   ├── db/
│   │   ├── driver.ts           # Interface DbDriver (shim testable)
│   │   ├── repository.ts       # Interface TodoRepository
│   │   ├── sqlite-repository.ts
│   │   ├── index.ts            # Factories createRepository()
│   │   └── migrations/
│   ├── store/                  # Stores Zustand (tasks, projects, tags, ui)
│   ├── theme/                  # Système de thèmes (tokens CSS, light, dark)
│   ├── types/                  # Types partagés (Task, Project, Tag…)
│   └── App.tsx                 # Initialisation DB + migration au démarrage
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
└── docs/
    └── superpowers/
        ├── specs/              # Design spec
        └── plans/              # Plan d'implémentation
```

---

## Données

La base SQLite est stockée dans le répertoire de données applicatives de l'OS :

| OS      | Chemin                                         |
| ------- | ---------------------------------------------- |
| Linux   | `~/.local/share/usagi/usagi.db`                |
| macOS   | `~/Library/Application Support/usagi/usagi.db` |
| Windows | `%APPDATA%\usagi\usagi.db`                     |

Les migrations sont appliquées automatiquement au démarrage (`src/db/migrations/001_initial.sql`).

---

## Roadmap

- **Phase 1 (actuelle)** — application locale, SQLite
- **Phase 2** — synchronisation multi-device via [ElectricSQL](https://electric-sql.com) + PostgreSQL (swap de `SqliteRepository` → `ElectricRepository` sans toucher à l'UI)
- **Phase 3** — widget mobile, comptes utilisateurs
