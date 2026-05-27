# Usagi

Local, cross-platform task management application (Linux · macOS · Windows) built with Tauri 2.

Data is stored locally in SQLite. Architecture is ready for multi-device sync via ElectricSQL (phase 2).

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
- **Smart lists** — Inbox, Today, All tasks
- **Calendar** — monthly view of tasks by due date
- **Archives** — access to archived tasks
- **Tags** — cross-cutting task organisation
- **Tasks** — title, priority (none / low / medium / high), due date, tags, notes
- **Filter** — by priority, by status (completed), reset in one click
- **Task detail** — inline title editing, priority selector, date, tags, permanent deletion
- **Notifications** — daily reminders with customisable time slots
- **Themes** — light / dark / system + 7 custom themes (Luxury, Nature, Dracula, Retro, Ember, Deep Ocean, Ocean)
- **Visual effects** — optional glassmorphism and parallax
- **Keyboard shortcuts** — sort by urgency, due date and project, fully customisable
- **Languages** — French and English
- **Configurable sidebar** — icon mode, visibility of views (Calendar, Archives, Tags) customisable
- **Auto-update** — automatic update checks and in-app installation

---

## Tech stack

| Layer      | Technology                            |
| ---------- | ------------------------------------- |
| Native     | Tauri 2 (Rust)                        |
| UI         | React 19 + TypeScript                 |
| Components | shadcn/ui (Base UI + Tailwind CSS v4) |
| State      | Zustand                               |
| Database   | SQLite via `tauri-plugin-sql`         |
| Tests      | Vitest + @testing-library/react       |

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

- [Node.js](https://nodejs.org) ≥ 20
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
pnpm run test:run      # single run
pnpm run test          # watch mode
```

### TypeScript check

```bash
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
usagi/
├── src/                        # React + TypeScript frontend
│   ├── components/
│   │   ├── layout/             # AppShell, Sidebar, TaskList, TaskDetail
│   │   ├── tasks/              # TaskItem, TaskForm, FilterBar, selectors
│   │   └── ui/                 # shadcn/ui components (generated)
│   ├── db/
│   │   ├── driver.ts           # DbDriver interface (testable shim)
│   │   ├── repository.ts       # TodoRepository interface
│   │   ├── sqlite-repository.ts
│   │   ├── index.ts            # createRepository() factories
│   │   └── migrations/
│   ├── store/                  # Zustand stores (tasks, projects, tags, ui, settings)
│   ├── theme/                  # Theme system (CSS tokens, light, dark, custom)
│   ├── types/                  # Shared types (Task, Project, Tag…)
│   └── App.tsx                 # DB initialisation + migration on startup
├── src-tauri/                  # Rust backend (Tauri)
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
└── docs/
    └── superpowers/
        ├── specs/              # Design spec
        └── plans/              # Implementation plan
```

---

## Data

The SQLite database is stored in the OS application data directory:

| OS      | Path                                           |
| ------- | ---------------------------------------------- |
| Linux   | `~/.local/share/usagi/usagi.db`                |
| macOS   | `~/Library/Application Support/usagi/usagi.db` |
| Windows | `%APPDATA%\usagi\usagi.db`                     |

Migrations are applied automatically on startup.

---

## Roadmap

- **Phase 1 (current)** — local application, SQLite
- **Phase 2** — multi-device sync via [ElectricSQL](https://electric-sql.com) + PostgreSQL (swap `SqliteRepository` → `ElectricRepository` without touching the UI)
- **Phase 3** — mobile widget, user accounts

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
