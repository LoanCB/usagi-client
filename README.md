# Bunly

Local-first, cross-platform task management application (Linux · macOS · Windows) built with Tauri 2.

Data is stored locally in SQLite and the app works fully offline. Optional end-to-end encrypted sync between your devices is in development — see [Sync (phase 2)](#sync-phase-2).

> The GitHub repository is still named `usagi-client` for historical reasons; the application itself is **Bunly**.

---

## Built with Claude Code

This project was built as an experiment with [Claude Code](https://claude.ai/code), Anthropic's AI coding assistant. The goal was to explore how far AI-assisted development can go on a real, self-contained desktop application — from architecture decisions to feature implementation and cross-platform packaging.

---

## Download

Pre-built installers for Linux, macOS and Windows are available in the [**GitHub releases**](https://github.com/LoanCB/usagi-client/releases).

| Platform | Available formats     |
| -------- | --------------------- |
| Linux    | `.deb`, `.AppImage`   |
| macOS    | `.dmg`                |
| Windows  | `.msi`, `.exe` (NSIS) |

Download the latest release, run the installer for your OS and you're good to go.

---

## Features

- **Projects** — organise your tasks by project (color, icon)
- **Project groups** — group related projects, with color and shape markers
- **Smart lists** — Inbox, Today, All tasks
- **Calendar** — monthly view of tasks by due date
- **Archives** — access to archived tasks
- **Tags** — cross-cutting task organisation
- **Tasks** — title, priority, due date, tags, rich-text notes (checklists, links, formatting)
- **Priorities** — 7 levels, from none to blocker
- **Drag and drop** — reorder tasks and projects, including across project groups
- **Global search** — find any task, project or tag
- **Filter** — by priority, by project, by status (completed), reset in one click
- **Task detail** — inline title editing, priority selector, date, tags, permanent deletion
- **Notifications** — daily reminders with customisable time slots
- **Themes** — light / dark / system + 9 custom themes (Luxury, Nature, Dracula, Retro, Ember, Deep Ocean, Ocean, Rose Noir, Cosmic Gold)
- **Accessibility** — colorblind mode with shape-based project markers
- **Visual effects** — optional glassmorphism and parallax
- **Keyboard shortcuts** — sort by urgency, due date and project, fully customisable
- **Languages** — French and English
- **Configurable sidebar** — icon mode, visibility of views (Calendar, Archives, Tags) customisable
- **What's new** — in-app changelog listing changes by version
- **Auto-update** — automatic update checks and in-app installation

---

## Tech stack

| Layer        | Technology                                |
| ------------ | ----------------------------------------- |
| Native       | Tauri 2 (Rust)                            |
| UI           | React 19 + TypeScript                     |
| Components   | shadcn/ui (Base UI + Tailwind CSS v4)     |
| State        | Zustand                                   |
| Database     | SQLite via `tauri-plugin-sql`             |
| Rich text    | Tiptap 3                                  |
| Drag & drop  | dnd-kit                                   |
| i18n         | i18next + react-i18next                   |
| Unit tests   | Vitest + @testing-library/react           |
| E2E tests    | Playwright                                |
| Lint /format | Biome                                     |

---

## Sync (phase 2)

Sync is **optional**. Bunly stays a purely local application until you configure a server.

The design is specified in [`docs/superpowers/specs/2026-08-20-sync-offline-first-design.md`](docs/superpowers/specs/2026-08-20-sync-offline-first-design.md).

> **Status:** in development. The sync engine and client-side crypto are implemented on the development branches; the settings UI is in progress. No published release includes sync yet.

### Approach

Sync is a custom offline-first implementation against a self-hostable [NestJS](https://nestjs.com) server (`usagi-server`, separate repository) backed by PostgreSQL. Neither ElectricSQL nor CRDTs are used — the spec documents why.

The sync engine **observes** `SqliteRepository` rather than replacing it. Writes stay local and synchronous, so the UI is never blocked by the network:

- **Outbox queue** — SQLite triggers record every local change in a `sync_outbox` table. Offline, the queue simply accumulates and drains on reconnect.
- **Pull → merge → push** — triggered on startup, on window focus, every 5 minutes, and shortly after a local write.
- **Conflict resolution** — last-writer-wins per field, using a timestamp map embedded in the encrypted payload, with a deterministic device tie-break.
- **Ordering** — fractional indexing (text keys) replaces `sort_order INTEGER`, so concurrent reordering converges without conflicts.
- **Deletions** — permanent deletes leave a tombstone rather than erasing the row, so they propagate to other devices.

### End-to-end encryption

The server stores ciphertext only and cannot read your data.

- Key derivation with Argon2id from your email and password
- Per-record encryption with XChaCha20-Poly1305
- An X25519 keypair per account, generated at sign-up, for future sharing
- A 24-word recovery key shown once at sign-up — it is the only way back in if you forget your password

Authentication uses email and password, with a short-lived access token and a refresh token that is revocable per device.

Tasks, projects, tags and project groups sync. Settings and keyboard shortcuts stay per-device by design.

---

## Development

### Prerequisites

#### Rust

Tauri requires the Rust toolchain. Install it via [rustup](https://rustup.rs):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### System dependencies

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

**macOS** — install the Command Line Tools:

```bash
xcode-select --install
```

**Windows** — make sure [Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is installed (included by default on Windows 10 1803+ and Windows 11).

#### Node.js and pnpm

- [Node.js](https://nodejs.org) — see [`.nvmrc`](.nvmrc) for the pinned version
- [pnpm](https://pnpm.io) ≥ 9

```bash
npm install -g pnpm
```

### Installation and launch

```bash
# Clone the repository
git clone https://github.com/LoanCB/usagi-client.git
cd usagi-client

# Install JavaScript dependencies
pnpm install

# Start in development mode
pnpm tauri dev
```

This starts the Vite dev server (`localhost:1420`) and opens the Tauri window with hot reload.

### Tests

```bash
pnpm run test:run      # unit tests, single run
pnpm run test          # unit tests, watch mode
pnpm run test:e2e      # Playwright end-to-end tests
```

### Lint and TypeScript check

```bash
pnpm run lint          # Biome check
pnpm run lint:fix      # Biome check + autofix
pnpm run build         # tsc + vite build (without the Rust part)
```

### Build from source

```bash
pnpm tauri build
```

This command:

1. compiles the React frontend (`vite build`)
2. compiles the Rust binary
3. generates native installers for the current platform in `src-tauri/target/release/bundle/`

---

## Project structure

```text
usagi-client/
├── src/                        # React + TypeScript frontend
│   ├── components/
│   │   ├── layout/             # AppShell, Sidebar, TaskList, TaskDetail
│   │   ├── tasks/              # TaskItem, TaskForm, FilterBar, RichTextEditor, selectors
│   │   ├── projects/           # Project and project-group management
│   │   ├── tags/               # Tag management
│   │   ├── calendar/           # Monthly calendar view
│   │   └── ui/                 # shadcn/ui components (generated)
│   ├── db/
│   │   ├── driver.ts           # DbDriver interface (testable shim)
│   │   ├── repository.ts       # TodoRepository interface
│   │   ├── sqlite-repository.ts
│   │   ├── index.ts            # createRepository() factories
│   │   ├── field-timestamps.ts # Per-field timestamps used by sync merge
│   │   ├── backfill-sort-keys.ts
│   │   └── migrations/         # Numbered SQL migrations + runner
│   ├── hooks/                  # Shared React hooks
│   ├── i18n/                   # i18next setup + locales (en, fr)
│   ├── store/                  # Zustand stores (tasks, projects, tags, ui, settings)
│   ├── theme/                  # Theme system (CSS tokens, light, dark, custom)
│   ├── types/                  # Shared types (Task, Project, Tag…)
│   ├── test-harness/           # In-memory repository and SQLite test driver
│   └── App.tsx                 # DB initialisation + migration on startup
├── src-tauri/                  # Rust backend (Tauri)
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/
│   └── e2e/                    # Playwright end-to-end tests
└── docs/
    └── superpowers/
        ├── specs/              # Design specs
        └── plans/              # Implementation plans
```

---

## Data

The SQLite database is stored in the OS application config directory, under the app identifier `com.bunly.app`:

| OS      | Path                                                     |
| ------- | -------------------------------------------------------- |
| Linux   | `~/.config/com.bunly.app/usagi.db`                       |
| macOS   | `~/Library/Application Support/com.bunly.app/usagi.db`   |
| Windows | `%APPDATA%\com.bunly.app\usagi.db`                       |

Migrations are applied automatically on startup.

---

## Roadmap

- **Phase 1 (done)** — local application, SQLite
- **Phase 2 (in progress)** — optional end-to-end encrypted multi-device sync against a self-hosted NestJS server, see [Sync (phase 2)](#sync-phase-2)
- **Phase 3** — mobile widget, account sharing

## Versioning

This project follows **CalVer**: `YYYY.MINOR.PATCH`

| Component | Meaning                                                        |
| --------- | -------------------------------------------------------------- |
| `YYYY`    | Calendar year of the release (e.g. `2026`)                     |
| `MINOR`   | Release number within the year, incremented for each version   |
| `PATCH`   | Bug fix with no new feature                                    |

Examples: `2026.1.0` → first release of 2026, `2026.1.1` → patch, `2026.2.0` → second release.

---

## License

Licensed under PolyForm Noncommercial 1.0.0.

- ✅ Personal use

- ✅ Modification

- ✅ Redistribution

- ❌ Commercial use without permission

Copyright © 2026 LoanCB
