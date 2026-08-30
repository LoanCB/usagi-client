# Archive View — Filtres projet + recherche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une toolbar dans le header de la vue archive avec un champ de recherche texte et un filtre projet (single-select), filtrés côté composant.

**Architecture:** Filtrage 100% local dans `ArchiveView` via deux états locaux (`search`, `filterProjectId`) et deux `useMemo` (`availableProjects`, `filteredTasks`). Aucun changement au store, au repo, ou aux autres composants.

**Tech Stack:** React, TypeScript, Tailwind CSS, i18next, base-ui Select, Vitest + React Testing Library

---

## Files

| Action | Fichier                                 | Rôle                              |
| ------ | --------------------------------------- | --------------------------------- |
| Modify | `src/i18n/locales/en.ts`                | Ajouter `archive.noResults`       |
| Modify | `src/i18n/locales/fr.ts`                | Ajouter `archive.noResults`       |
| Modify | `src/components/layout/ArchiveView.tsx` | Ajouter filtres + toolbar         |
| Create | `src/test/ArchiveView.test.tsx`         | Tests du comportement de filtrage |

---

### Task 1 : Ajouter la clé i18n `archive.noResults`

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1 : Ajouter la clé dans `en.ts`**

Dans `src/i18n/locales/en.ts`, dans le bloc `archive:`, ajouter après `archivedOn`:

```ts
archive: {
    empty: "No archived tasks",
    archivedOn: "Archived on {{date}}",
    noResults: "No tasks match your filters",
},
```

- [ ] **Step 2 : Ajouter la clé dans `fr.ts`**

Dans `src/i18n/locales/fr.ts`, même bloc :

```ts
archive: {
    empty: "Aucune tâche archivée",
    archivedOn: "Archivée le {{date}}",
    noResults: "Aucune tâche ne correspond aux filtres",
},
```

- [ ] **Step 3 : Vérifier que TypeScript compile**

```bash
pnpm tsc --noEmit
```

Résultat attendu : aucune erreur. Si `fr.ts` ne respecte plus `typeof en`, TypeScript le signale ici.

---

### Task 2 : Écrire les tests pour le filtrage (TDD)

**Files:**

- Create: `src/test/ArchiveView.test.tsx`

- [ ] **Step 1 : Créer le fichier de test**

Créer `src/test/ArchiveView.test.tsx` avec ce contenu complet :

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveView } from "@/components/layout/ArchiveView";
import { useProjectStore } from "@/store/projects";
import { useTaskStore } from "@/store/tasks";
import type { Project, Task } from "@/types";

vi.mock("@/store/repository", () => ({
  getRepository: vi.fn(() => ({})),
}));

const mockTasks: Task[] = [
  {
    id: "t1",
    title: "Rapport Q2",
    projectId: "proj-marketing",
    completedAt: null,
    deletedAt: "2026-05-20",
    priority: "none",
    dueDate: null,
    description: null,
    tags: [],
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
  },
  {
    id: "t2",
    title: "Maquette login",
    projectId: "proj-design",
    completedAt: null,
    deletedAt: "2026-05-21",
    priority: "none",
    dueDate: null,
    description: null,
    tags: [],
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  },
  {
    id: "t3",
    title: "Fixer le bug nav",
    projectId: null,
    completedAt: null,
    deletedAt: "2026-05-22",
    priority: "none",
    dueDate: null,
    description: null,
    tags: [],
    sortOrder: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  },
];

const mockProjects: Project[] = [
  {
    id: "proj-marketing",
    name: "Marketing",
    color: null,
    icon: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "proj-design",
    name: "Design",
    color: null,
    icon: null,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function setupWithTasks() {
  useTaskStore.setState({
    archivedTasks: mockTasks,
    loadArchivedTasks: vi.fn(),
    unarchiveTask: vi.fn(),
    deleteTask: vi.fn(),
  });
  useProjectStore.setState({ projects: mockProjects });
  return render(<ArchiveView />);
}

describe("ArchiveView — filtres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche toutes les tâches archivées par défaut", () => {
    setupWithTasks();
    expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
    expect(screen.getByText("Maquette login")).toBeInTheDocument();
    expect(screen.getByText("Fixer le bug nav")).toBeInTheDocument();
  });

  it("filtre par texte de recherche (insensible à la casse)", async () => {
    setupWithTasks();
    const user = userEvent.setup();
    const searchInput = screen.getByRole("textbox", { name: /rechercher/i });
    await user.type(searchInput, "rapport");
    expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
    expect(screen.queryByText("Maquette login")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixer le bug nav")).not.toBeInTheDocument();
  });

  it("efface la recherche avec le bouton X", async () => {
    setupWithTasks();
    const user = userEvent.setup();
    const searchInput = screen.getByRole("textbox", { name: /rechercher/i });
    await user.type(searchInput, "rapport");
    const clearButton = screen.getByRole("button", { name: /clear search/i });
    await user.click(clearButton);
    expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
    expect(screen.getByText("Maquette login")).toBeInTheDocument();
    expect(screen.getByText("Fixer le bug nav")).toBeInTheDocument();
  });

  it("affiche le message noResults quand aucune tâche ne correspond", async () => {
    setupWithTasks();
    const user = userEvent.setup();
    const searchInput = screen.getByRole("textbox", { name: /rechercher/i });
    await user.type(searchInput, "xyz_aucun_résultat");
    expect(
      screen.getByText(/aucune tâche ne correspond aux filtres/i),
    ).toBeInTheDocument();
  });

  it("n'affiche pas le select projet si aucune tâche n'a de projet", () => {
    useTaskStore.setState({
      archivedTasks: [mockTasks[2]], // seule la tâche sans projet
      loadArchivedTasks: vi.fn(),
      unarchiveTask: vi.fn(),
      deleteTask: vi.fn(),
    });
    useProjectStore.setState({ projects: mockProjects });
    render(<ArchiveView />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm test src/test/ArchiveView.test.tsx
```

Résultat attendu : FAIL — `getByRole("textbox", { name: /rechercher/i })` ne trouve rien car le champ de recherche n'existe pas encore.

---

### Task 3 : Implémenter les filtres dans `ArchiveView`

**Files:**

- Modify: `src/components/layout/ArchiveView.tsx`

- [ ] **Step 1 : Mettre à jour les imports**

En tête de `src/components/layout/ArchiveView.tsx`, remplacer les imports existants par :

```tsx
import { RotateCcw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
```

- [ ] **Step 2 : Ajouter l'état local et les données calculées**

Dans le corps de `ArchiveView()`, après la ligne `const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);`, ajouter :

```tsx
const [search, setSearch] = useState("");
const [filterProjectId, setFilterProjectId] = useState<string | null>(null);

const availableProjects = useMemo(() => {
  const ids = new Set(archivedTasks.map((t) => t.projectId).filter(Boolean));
  return projects.filter((p) => ids.has(p.id));
}, [archivedTasks, projects]);

const filteredTasks = useMemo(() => {
  return archivedTasks.filter((task) => {
    const matchesSearch =
      !search.trim() || task.title.toLowerCase().includes(search.toLowerCase());
    const matchesProject =
      filterProjectId === null || task.projectId === filterProjectId;
    return matchesSearch && matchesProject;
  });
}, [archivedTasks, search, filterProjectId]);
```

- [ ] **Step 3 : Remplacer le header et la liste par le JSX complet**

Remplacer tout le `return (...)` de `ArchiveView` par :

```tsx
return (
  <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <div className="px-6 py-5 border-b border-border shrink-0 flex items-center gap-3">
      <h2 className="text-lg font-semibold flex-1">{t("nav.archives")}</h2>
      {/* Search */}
      <div className="glass-stat flex items-center gap-2 rounded-xl px-3 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("task.search")}
          aria-label={t("task.search")}
          className="w-32 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
        <button
          type="button"
          onClick={() => setSearch("")}
          className={`shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors ${search ? "visible" : "invisible"}`}
          aria-label="Clear search"
          tabIndex={search ? 0 : -1}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Project filter */}
      {availableProjects.length > 0 && (
        <Select
          value={filterProjectId ?? "all"}
          onValueChange={(v) => setFilterProjectId(v === "all" ? null : v)}
        >
          <SelectTrigger size="sm">
            <SelectValue>
              {(v: string) =>
                v === "all"
                  ? t("calendar.filter.allProjects")
                  : (availableProjects.find((p) => p.id === v)?.name ??
                    t("calendar.filter.allProjects"))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("calendar.filter.allProjects")}
            </SelectItem>
            {availableProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
    <ScrollArea className="flex-1 min-h-0">
      {archivedTasks.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          {t("archive.empty")}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          {t("archive.noResults")}
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-3">
          {filteredTasks.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 mx-0 my-1 pl-3 pr-2 py-2.5 rounded-xl border glass-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate line-through text-muted-foreground">
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {project?.name && (
                      <span className="mr-2">{project.name}</span>
                    )}
                    {task.deletedAt &&
                      t("archive.archivedOn", {
                        date: formatDate(
                          task.deletedAt.slice(0, 10),
                          i18n.language,
                        ),
                      })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => unarchiveTask(repo, task.id)}
                  aria-label={t("task.restore")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDeleteId(task.id)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
    <ConfirmDeleteDialog
      open={confirmDeleteId !== null}
      onConfirm={async () => {
        if (confirmDeleteId) await deleteTask(repo, confirmDeleteId);
        setConfirmDeleteId(null);
      }}
      onCancel={() => setConfirmDeleteId(null)}
    />
  </div>
);
```

- [ ] **Step 4 : Vérifier que TypeScript compile**

```bash
pnpm tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Step 5 : Lancer les tests**

```bash
pnpm test src/test/ArchiveView.test.tsx
```

Résultat attendu : tous les tests passent.

- [ ] **Step 6 : Lancer tous les tests**

```bash
pnpm test
```

Résultat attendu : aucune régression sur les tests existants.
