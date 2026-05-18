# Usagi

Application de gestion de tâches locale, cross-platform (Linux · macOS · Windows), construite avec Tauri 2.

Données stockées localement dans SQLite. Architecture prête pour une synchronisation multi-device via ElectricSQL (phase 2).

---

## Téléchargement

Les installateurs compilés pour Linux, macOS et Windows sont disponibles dans les [**releases GitHub**](https://github.com/LoanCB/usagi-client/releases).

| Plateforme | Formats disponibles   |
| ---------- | --------------------- |
| Linux      | `.deb`, `.AppImage`   |
| macOS      | `.dmg`                |
| Windows    | `.msi`, `.exe` (NSIS) |

Téléchargez la dernière version, lancez l'installateur correspondant à votre OS et c'est prêt.

---

## Fonctionnalités

- **Projets** — organisez vos tâches par projet (couleur, icône)
- **Smart lists** — Inbox, Aujourd'hui, Toutes les tâches
- **Calendrier** — vue mensuelle des tâches par échéance
- **Archives** — accès aux tâches archivées
- **Tags** — organisation transversale des tâches
- **Tâches** — titre, priorité (aucune / basse / moyenne / haute), date d'échéance, tags, notes
- **Filtre** — par priorité, par statut (complétées), réinitialisation en un clic
- **Détail de tâche** — édition inline du titre, sélecteur de priorité, date, tags, suppression définitive
- **Notifications** — rappels quotidiens avec créneaux horaires personnalisables
- **Thèmes** — clair / sombre / système + 7 thèmes personnalisés (Luxury, Nature, Dracula, Retro, Ember, Deep Ocean, Ocean)
- **Effets visuels** — glassmorphisme et parallaxe optionnels
- **Raccourcis clavier** — tri par urgence, date d'échéance et projet, entièrement personnalisables
- **Langues** — Français et Anglais
- **Sidebar configurable** — mode icônes, visibilité des vues (Calendrier, Archives, Tags) personnalisable

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

## Développement

### Prérequis

#### Rust

Tauri nécessite la toolchain Rust. Installez-la via [rustup](https://rustup.rs) :

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### Dépendances système

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

#### Node.js et pnpm

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 9

```bash
npm install -g pnpm
```

### Installation et lancement

```bash
# Cloner le dépôt
git clone https://github.com/LoanCB/usagi-client.git
cd usagi-client

# Installer les dépendances JavaScript
pnpm install

# Lancer en mode développement
pnpm tauri dev
```

Cela démarre le serveur Vite (`localhost:1420`) et ouvre la fenêtre Tauri avec rechargement à chaud.

### Tests

```bash
pnpm run test:run      # passage unique
pnpm run test          # mode watch
```

### Vérification TypeScript

```bash
pnpm run build         # tsc + vite build (sans la partie Rust)
```

### Construire depuis les sources

```bash
pnpm tauri build
```

Cette commande :

1. compile le frontend React (`vite build`)
2. compile le binaire Rust
3. génère les installateurs natifs pour la plateforme courante dans `src-tauri/target/release/bundle/`

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
│   ├── store/                  # Stores Zustand (tasks, projects, tags, ui, settings)
│   ├── theme/                  # Système de thèmes (tokens CSS, light, dark, custom)
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

Les migrations sont appliquées automatiquement au démarrage.

---

## Roadmap

- **Phase 1 (actuelle)** — application locale, SQLite
- **Phase 2** — synchronisation multi-device via [ElectricSQL](https://electric-sql.com) + PostgreSQL (swap de `SqliteRepository` → `ElectricRepository` sans toucher à l'UI)
- **Phase 3** — widget mobile, comptes utilisateurs
