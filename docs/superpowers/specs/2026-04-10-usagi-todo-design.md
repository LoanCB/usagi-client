# Usagi — TODO App : Design Spec

**Date :** 2026-04-10
**Statut :** Approuvé

---

## 1. Contexte & objectifs

Application de gestion de tâches cross-platform (Linux, macOS, Windows) construite avec Tauri. Les données sont stockées localement dans SQLite. L'architecture est conçue pour accueillir une synchronisation multi-device via ElectricSQL (PostgreSQL backend) dans une phase ultérieure, avec support offline-first.

**Hors scope (phase 1) :** synchronisation réseau, widget mobile, comptes utilisateurs.

---

## 2. Stack technique

| Couche                 | Technologie                                    |
| ---------------------- | ---------------------------------------------- |
| Shell natif            | Tauri 2 (Rust)                                 |
| UI                     | React 19 + TypeScript                          |
| Composants             | shadcn/ui (Radix UI + Tailwind CSS)            |
| Styles                 | Tailwind CSS v4                                |
| État                   | Zustand                                        |
| Base de données locale | SQLite via `tauri-plugin-sql`                  |
| Migrations             | SQL files versionnés dans `src/db/migrations/` |

**Stack future (sync) :** ElectricSQL + PostgreSQL, implémenté via `ElectricRepository` sans toucher au reste de l'app.

---

## 3. Modèle de données

Toutes les tables sont conçues pour la sync future : UUIDs comme clés primaires, soft deletes via `deleted_at`, timestamps `created_at` / `updated_at` sur chaque enregistrement.

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,        -- UUID v4
  name        TEXT NOT NULL,
  color       TEXT,                    -- ex: "#6366f1"
  icon        TEXT,                    -- ex: "💼"
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,           -- ISO 8601
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT                     -- NULL = actif
);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,       -- UUID v4
  title        TEXT NOT NULL,
  project_id   TEXT REFERENCES projects(id),  -- NULL = Inbox
  priority     TEXT DEFAULT 'none'
                 CHECK(priority IN ('none','low','medium','high')),
  due_date     TEXT,                   -- ISO 8601 date, nullable
  completed_at TEXT,                  -- NULL = non complétée
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE task_tags (
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  tag_id      TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (task_id, tag_id)
);
```

**Règles métier :**

- `project_id = NULL` → tâche dans l'**Inbox** (pas de ligne en base, vue logique)
- `completed_at` non null = tâche complétée (sert aussi de timestamp)
- `deleted_at` non null = supprimée (soft delete, requis pour la sync)
- Conflits de sync résolus par last-write-wins sur `updated_at`
- `task_tags` utilise des **hard deletes** (pas de `deleted_at`) : c'est une table de jointure sans cycle de vie propre. En phase 2, la sync traitera les suppressions de tags sur une tâche comme des opérations de delete classiques.

---

## 4. Architecture — couches

```text
┌────────────────────────────────────────────────┐
│                  Tauri App                      │
│  ┌──────────────────────────────────────────┐  │
│  │         React + TypeScript (Webview)      │  │
│  │                                           │  │
│  │  Zustand Stores ◄── UI Components         │  │
│  │  (tasks / projects / tags / ui)           │  │
│  │              │                            │  │
│  │  ┌───────────▼──────────────────────────┐ │  │
│  │  │   TodoRepository (interface TS)      │ │  │
│  │  │   SqliteRepository  (phase 1)        │ │  │
│  │  │   ElectricRepository (phase 2)       │ │  │
│  │  └───────────┬──────────────────────────┘ │  │
│  └──────────────┼─────────────────────────────┘  │
│                 │ tauri-plugin-sql               │
│  ┌──────────────▼──────────────────────────────┐ │
│  │           SQLite (fichier local)            │ │
│  └─────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

---

## 5. Repository layer

### Interface

```typescript
// src/db/repository.ts
interface TodoRepository {
  // Tasks
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task>;
  completeTask(id: string): Promise<Task>;
  uncompleteTask(id: string): Promise<Task>;
  deleteTask(id: string): Promise<void>; // soft delete

  // Projects
  getProjects(): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(
    id: string,
    patch: Partial<CreateProjectInput>,
  ): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Tags
  getTags(): Promise<Tag[]>;
  createTag(input: CreateTagInput): Promise<Tag>;
  updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
}
```

### Factory

```typescript
// src/db/index.ts — une seule ligne à changer pour passer à ElectricSQL
export function createRepository(): TodoRepository {
  return new SqliteRepository();
  // return new ElectricRepository()  ← phase 2
}
```

`SqliteRepository` : génère les UUIDs côté TypeScript (`crypto.randomUUID()`), met à jour `updated_at` à chaque écriture, filtre toujours sur `deleted_at IS NULL`.

---

## 6. Stores Zustand

```typescript
// store/tasks.ts
interface TaskStore {
  tasks: Task[];
  loading: boolean;
  createTask(input: CreateTaskInput): Promise<void>;
  updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<void>;
  completeTask(id: string): Promise<void>;
  uncompleteTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  loadTasks(filters?: TaskFilters): Promise<void>;
}

// store/projects.ts
interface ProjectStore {
  projects: Project[];
  createProject(input: CreateProjectInput): Promise<void>;
  updateProject(id: string, patch: Partial<CreateProjectInput>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  loadProjects(): Promise<void>;
}

// store/tags.ts
interface TagStore {
  tags: Tag[];
  createTag(input: CreateTagInput): Promise<void>;
  updateTag(id: string, patch: Partial<CreateTagInput>): Promise<void>;
  deleteTag(id: string): Promise<void>;
  loadTags(): Promise<void>;
}

// store/ui.ts  — état de l'interface uniquement, pas de données
interface UIStore {
  sidebarCollapsed: boolean;
  selectedProjectId: string | null; // null = Inbox
  selectedTaskId: string | null;
  activeFilters: TaskFilters;
  setSidebarCollapsed(v: boolean): void;
  setSelectedProject(id: string | null): void;
  setSelectedTask(id: string | null): void;
  setFilters(filters: Partial<TaskFilters>): void;
}
```

Chaque action de store appelle le repository puis met à jour le state local — pas de re-fetch global après chaque mutation.

---

## 7. Système de thèmes

Basé sur CSS custom properties alignées sur la convention shadcn/ui. Ajouter un thème = créer un objet TypeScript satisfaisant `ThemeTokens` — aucun composant à modifier.

```typescript
// src/theme/types.ts
interface ThemeTokens {
  // shadcn/ui base tokens
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--border": string;
  "--input": string;
  "--ring": string;
  "--radius": string;
  // Tokens spécifiques Usagi
  "--priority-high": string;
  "--priority-medium": string;
  "--priority-low": string;
}

type ThemeMode = "system" | "light" | "dark" | string; // string = thème custom nommé
```

- `ThemeProvider` applique les tokens sur `:root` et écoute `prefers-color-scheme` en mode `system`
- Les thèmes `light` et `dark` sont intégrés dans l'app
- Les thèmes custom sont des fichiers JSON chargeables sans recompilation
- Le choix utilisateur est persisté dans le store `ui` (sauvegardé via `localStorage` Tauri)

---

## 8. Structure UI

### Layout — 3 colonnes avec sidebar rétractable

```text
┌──────────┬──────────────────┬──────────────────┐
│ Sidebar  │   TaskList       │   TaskDetail      │
│          │                  │                   │
│ Projets  │ Filtres actifs   │ Titre éditable    │
│ SmartLists│ TaskItem[]      │ Priorité / Date   │
│          │                  │ Projet / Tags     │
│ [←]      │                  │ Actions           │
└──────────┴──────────────────┴──────────────────┘
  ↑ bouton collapse → sidebar réduite (icônes seules)
```

`TaskDetail` est masqué si `selectedTaskId` est null.

### Smart lists

| Vue                   | Filtre appliqué                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Inbox**             | `project_id IS NULL` + non supprimée + non complétée                                                          |
| **Aujourd'hui**       | `due_date <= date du jour` + non supprimée + non complétée                                                    |
| **Toutes les tâches** | tous projets + non supprimée + non complétée (tâches complétées exclues par défaut, filtrables via FilterBar) |

### Arborescence des composants

```text
AppShell
├── Sidebar (collapsible, largeur animée via Tailwind transition)
│   ├── SmartLists (Inbox, Aujourd'hui, Toutes les tâches)
│   ├── ProjectList
│   │   └── ProjectItem
│   └── SidebarToggleButton
├── TaskList
│   ├── TaskListHeader (titre + bouton "Nouvelle tâche" → ouvre TaskForm)
│   ├── FilterBar (shadcn DropdownMenu, Badge)
│   └── TaskItem[] (shadcn Checkbox, Badge pour priorité/tags)
│       └── clic → setSelectedTask(id)
└── TaskDetail (panneau droit, visible si selectedTaskId non null)
    ├── TaskTitleInput (shadcn Input, édition inline, sauvegarde on blur)
    ├── TaskMeta
    │   ├── PrioritySelector (shadcn DropdownMenu)
    │   ├── DueDatePicker (shadcn Popover + Calendar)
    │   ├── ProjectSelector (shadcn DropdownMenu)
    │   └── TagSelector (shadcn Popover + multi-select)
    └── TaskActions (compléter, supprimer — shadcn Button)
```

**`TaskForm`** : Dialog de création rapide (shadcn Dialog), ouvert via le bouton "Nouvelle tâche" dans `TaskListHeader`. Contient uniquement titre + priorité + date d'échéance. Les autres métadonnées s'éditent dans `TaskDetail` après création.

### Composants shadcn/ui utilisés

`Checkbox`, `Button`, `Input`, `Badge`, `DropdownMenu`, `Popover`, `Calendar`, `Dialog`, `Tooltip`, `Sheet`, `Separator`, `ScrollArea`

---

## 9. Structure des fichiers

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TaskList.tsx
│   │   └── TaskDetail.tsx
│   ├── tasks/
│   │   ├── TaskItem.tsx
│   │   ├── TaskForm.tsx
│   │   ├── FilterBar.tsx
│   │   ├── PrioritySelector.tsx
│   │   ├── DueDatePicker.tsx
│   │   └── TagSelector.tsx
│   └── ui/                     ← composants shadcn/ui (générés)
├── db/
│   ├── repository.ts           ← interface TodoRepository
│   ├── sqlite-repository.ts    ← implémentation SQLite
│   ├── migrations/
│   │   └── 001_initial.sql
│   └── index.ts                ← factory createRepository()
├── store/
│   ├── tasks.ts
│   ├── projects.ts
│   ├── tags.ts
│   └── ui.ts
├── theme/
│   ├── types.ts
│   ├── ThemeProvider.tsx
│   └── themes/
│       ├── light.ts
│       └── dark.ts
├── types/
│   └── index.ts                ← Task, Project, Tag, TaskFilters…
├── lib/
│   └── utils.ts                ← cn(), uuid(), formatDate()
└── App.tsx
```

---

## 10. Types partagés

```typescript
// src/types/index.ts

type Priority = "none" | "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  projectId: string | null;
  priority: Priority;
  dueDate: string | null;
  completedAt: string | null;
  tags: Tag[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface TaskFilters {
  projectId?: string | null; // null = Inbox, undefined = tous
  tagIds?: string[];
  priority?: Priority;
  completed?: boolean;
  dueBefore?: string;
}

interface CreateTaskInput {
  title: string;
  projectId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  tagIds?: string[];
}

interface CreateProjectInput {
  name: string;
  color?: string;
  icon?: string;
}

interface CreateTagInput {
  name: string;
  color?: string;
}
```

---

## 11. Préparation sync (ElectricSQL — phase 2)

Les éléments suivants sont en place dès la phase 1 pour faciliter l'intégration :

| Élément                      | Pourquoi                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| UUIDs v4 comme PKs           | Pas de collision entre devices                                     |
| `created_at` / `updated_at`  | Last-write-wins conflict resolution                                |
| `deleted_at` (soft delete)   | Propagation des suppressions en sync                               |
| `TodoRepository` interface   | Swap `SqliteRepository` → `ElectricRepository` sans toucher à l'UI |
| `createRepository()` factory | Point d'injection unique                                           |

La migration vers ElectricSQL consistera à : (1) créer `ElectricRepository`, (2) ajouter le client Electric, (3) changer la factory — rien d'autre.
