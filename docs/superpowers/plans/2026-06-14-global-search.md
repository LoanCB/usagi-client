# Global Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une palette de recherche globale (CTRL+K / ⌘K) permettant de rechercher et naviguer vers des tâches, projets et tags, avec actions rapides au clavier (Tab).

**Architecture:** Un store Zustand minimal gère l'état ouvert/fermé. Le composant `GlobalSearch` enveloppe la librairie `cmdk` dans le Dialog de `@base-ui/react`. Le filtrage est 100% en mémoire sur les stores Zustand existants. Les tâches archivées sont chargées à la première ouverture.

**Tech Stack:** cmdk v1 (headless command palette), @base-ui/react/dialog, Zustand, react-i18next, TailwindCSS v4, Vitest + @testing-library/react

---

## File Map

**Créés :**
- `src/store/search.ts` — store Zustand `{ isOpen, open, close, toggle }`
- `src/store/search.test.ts` — tests unitaires du store
- `src/components/layout/GlobalSearch.tsx` — composant principal
- `src/components/layout/GlobalSearch.test.tsx` — tests d'intégration

**Modifiés :**
- `src/components/layout/AppShell.tsx` — montage de `<GlobalSearch />` + listener CTRL+K
- `src/i18n/locales/en.ts` — clés `search.*`
- `src/i18n/locales/fr.ts` — clés `search.*`

---

## Task 1: Installer cmdk

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Installer la dépendance**

```bash
pnpm add cmdk
```

- [ ] **Step 2: Vérifier l'installation**

```bash
pnpm list cmdk
```

Expected output: `cmdk 1.x.x`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add cmdk for global search palette"
```

---

## Task 2: Ajouter les clés i18n

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Ajouter les clés anglaises**

Dans `src/i18n/locales/en.ts`, ajouter après le bloc `data: { ... },` (avant la fermeture `}`):

```ts
	search: {
		placeholder: "Search tasks, projects, tags…",
		tasks: "Tasks",
		projects: "Projects",
		tags: "Tags",
		noResults: "No results",
		complete: "Mark as complete",
		uncomplete: "Mark as active",
		archive: "Archive task",
		completed: "completed",
		archived: "archived",
		navigateHint: "Navigate",
		openHint: "Open",
		actionsHint: "Actions",
	},
```

- [ ] **Step 2: Ajouter les clés françaises**

Dans `src/i18n/locales/fr.ts`, ajouter au même endroit (la syntaxe `const fr: typeof en` force la correspondance):

```ts
	search: {
		placeholder: "Rechercher tâches, projets, tags…",
		tasks: "Tâches",
		projects: "Projets",
		tags: "Tags",
		noResults: "Aucun résultat",
		complete: "Marquer comme complétée",
		uncomplete: "Marquer comme active",
		archive: "Archiver la tâche",
		completed: "complétée",
		archived: "archivée",
		navigateHint: "Naviguer",
		openHint: "Ouvrir",
		actionsHint: "Actions",
	},
```

- [ ] **Step 3: Vérifier la compilation TypeScript**

```bash
pnpm exec tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/fr.ts
git commit -m "feat: add i18n keys for global search"
```

---

## Task 3: Store Zustand `useSearchStore`

**Files:**
- Create: `src/store/search.ts`
- Create: `src/store/search.test.ts`

- [ ] **Step 1: Écrire le test en premier**

Créer `src/store/search.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useSearchStore } from "@/store/search";

beforeEach(() => {
	useSearchStore.setState({ isOpen: false });
});

describe("useSearchStore", () => {
	it("starts closed", () => {
		expect(useSearchStore.getState().isOpen).toBe(false);
	});

	it("open() sets isOpen to true", () => {
		useSearchStore.getState().open();
		expect(useSearchStore.getState().isOpen).toBe(true);
	});

	it("close() sets isOpen to false", () => {
		useSearchStore.setState({ isOpen: true });
		useSearchStore.getState().close();
		expect(useSearchStore.getState().isOpen).toBe(false);
	});

	it("toggle() opens when closed", () => {
		useSearchStore.getState().toggle();
		expect(useSearchStore.getState().isOpen).toBe(true);
	});

	it("toggle() closes when open", () => {
		useSearchStore.setState({ isOpen: true });
		useSearchStore.getState().toggle();
		expect(useSearchStore.getState().isOpen).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

```bash
pnpm test src/store/search.test.ts
```

Expected: FAIL — `Cannot find module '@/store/search'`

- [ ] **Step 3: Implémenter le store**

Créer `src/store/search.ts` :

```ts
import { create } from "zustand";

interface SearchStore {
	isOpen: boolean;
	open(): void;
	close(): void;
	toggle(): void;
}

export const useSearchStore = create<SearchStore>((set) => ({
	isOpen: false,
	open: () => set({ isOpen: true }),
	close: () => set({ isOpen: false }),
	toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
```

- [ ] **Step 4: Relancer les tests**

```bash
pnpm test src/store/search.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/search.ts src/store/search.test.ts
git commit -m "feat: add useSearchStore for global search open/close state"
```

---

## Task 4: Composant GlobalSearch — squelette Dialog + input

**Files:**
- Create: `src/components/layout/GlobalSearch.tsx`

L'objectif de cette tâche est uniquement la structure : Dialog ouvert/fermé, input cmdk visible. Pas encore de résultats.

- [ ] **Step 1: Créer le composant squelette**

Créer `src/components/layout/GlobalSearch.tsx` :

```tsx
import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSearchStore } from "@/store/search";

export function GlobalSearch() {
	const { isOpen, close } = useSearchStore();
	const [query, setQuery] = useState("");
	const { t } = useTranslation();

	function handleClose() {
		close();
		setQuery("");
	}

	return (
		<Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<Dialog.Portal>
				<Dialog.Backdrop
					className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
				/>
				<Dialog.Popup
					className={cn(
						"fixed left-1/2 top-[20%] z-50 w-full max-w-[580px] -translate-x-1/2",
						"outline-none",
						"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
						"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
					)}
				>
					<Command
						shouldFilter={false}
						className="overflow-hidden rounded-xl bg-popover ring-1 ring-foreground/10 shadow-2xl"
					>
						{/* Input */}
						<div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
							<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
							<Command.Input
								value={query}
								onValueChange={setQuery}
								placeholder={t("search.placeholder")}
								className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
								autoFocus
							/>
							<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
								ESC
							</kbd>
						</div>

						{/* Results — à remplir dans les tâches suivantes */}
						<Command.List className="max-h-[380px] overflow-y-auto p-1" />
					</Command>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
```

- [ ] **Step 2: Compiler pour vérifier les imports**

```bash
pnpm exec tsc --noEmit
```

Expected: aucune erreur.

---

## Task 5: Monter GlobalSearch dans AppShell + listener CTRL+K

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Modifier AppShell.tsx**

Ajouter les imports :
```tsx
import { useEffect } from "react";   // déjà présent
import { GlobalSearch } from "./GlobalSearch";
import { isMac } from "@/lib/utils";
import { useSearchStore } from "@/store/search";
```

Ajouter dans le corps de `AppShell()`, après les hooks existants :
```tsx
const toggleSearch = useSearchStore((s) => s.toggle);

useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
        const modifier = isMac() ? e.metaKey : e.ctrlKey;
        if (modifier && e.key === "k") {
            e.preventDefault();
            toggleSearch();
        }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
}, [toggleSearch]);
```

Ajouter `<GlobalSearch />` dans le JSX, avant la fermeture de la div racine :
```tsx
	{/* ... contenu existant ... */}
	<GlobalSearch />
</div>
```

Le JSX final de `AppShell` doit ressembler à :
```tsx
return (
    <div className="app-shell relative flex h-screen overflow-hidden text-foreground">
        {/* ... orbs glassmorphism existants ... */}
        <div className="relative z-10 flex h-full w-full overflow-hidden">
            <Sidebar />
            {renderMainPanel()}
            {showDetail && (
                <>
                    <ResizeHandle ... />
                    <TaskDetail width={width} />
                </>
            )}
        </div>
        <GlobalSearch />
    </div>
);
```

- [ ] **Step 2: Lancer le dev server et tester CTRL+K**

```bash
pnpm tauri dev
```

Appuyer sur CTRL+K (ou ⌘K sur macOS) : la palette doit s'ouvrir avec l'input. ESC doit la fermer.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/GlobalSearch.tsx
git commit -m "feat: add GlobalSearch skeleton with CTRL+K shortcut"
```

---

## Task 6: Résultats de tâches — filtrage + navigation

**Files:**
- Modify: `src/components/layout/GlobalSearch.tsx`
- Create: `src/components/layout/GlobalSearch.test.tsx`

- [ ] **Step 1: Écrire les tests en premier**

Créer `src/components/layout/GlobalSearch.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { vi } from "vitest";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useProjectStore } from "@/store/projects";
import { useSearchStore } from "@/store/search";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({
		getTasks: vi.fn().mockResolvedValue([]),
		getArchivedTasks: vi.fn().mockResolvedValue([]),
	})),
}));

const mockNavigateToTask = vi.fn();
const mockSetSelectedProject = vi.fn();

const makeTask = (overrides: Partial<Task> = {}): Task => ({
	id: "task-1",
	title: "Buy groceries",
	description: null,
	projectId: null,
	priority: "none",
	dueDate: null,
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	useSearchStore.setState({ isOpen: true });
	useTaskStore.setState({ tasks: [], archivedTasks: [], loading: false, allCount: 0, todayCount: 0 });
	useProjectStore.setState({ projects: [] });
	useTagStore.setState({ tags: [] });
	useUIStore.setState({
		navigateToTask: mockNavigateToTask,
		setSelectedProject: mockSetSelectedProject,
		selectedProjectId: undefined,
		selectedTaskId: null,
		activeFilters: {},
		sidebarCollapsed: false,
	} as Parameters<typeof useUIStore.setState>[0]);
});

describe("GlobalSearch — visibility", () => {
	it("renders the input when open", () => {
		render(<GlobalSearch />);
		expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument();
	});

	it("renders nothing when closed", () => {
		useSearchStore.setState({ isOpen: false });
		render(<GlobalSearch />);
		expect(screen.queryByPlaceholderText(/search tasks/i)).not.toBeInTheDocument();
	});
});

describe("GlobalSearch — task results", () => {
	it("shows a task that matches the query", async () => {
		useTaskStore.setState({ tasks: [makeTask({ title: "Buy groceries" })], archivedTasks: [], loading: false, allCount: 1, todayCount: 0 });
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/search tasks/i), "grocer");
		expect(await screen.findByText("Buy groceries")).toBeInTheDocument();
	});

	it("does not show a task that does not match", async () => {
		useTaskStore.setState({ tasks: [makeTask({ title: "Buy groceries" })], archivedTasks: [], loading: false, allCount: 1, todayCount: 0 });
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/search tasks/i), "xyz");
		expect(screen.queryByText("Buy groceries")).not.toBeInTheDocument();
	});

	it("includes archived tasks in results", async () => {
		useTaskStore.setState({
			tasks: [],
			archivedTasks: [makeTask({ id: "archived-1", title: "Old archived task", deletedAt: new Date().toISOString() })],
			loading: false,
			allCount: 0,
			todayCount: 0,
		});
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/search tasks/i), "archived");
		expect(await screen.findByText("Old archived task")).toBeInTheDocument();
	});
});

describe("GlobalSearch — navigation", () => {
	it("calls navigateToTask when a task result is clicked", async () => {
		const task = makeTask({ id: "task-1", title: "Buy groceries", projectId: "proj-1" });
		useTaskStore.setState({ tasks: [task], archivedTasks: [], loading: false, allCount: 1, todayCount: 0 });
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/search tasks/i), "grocer");
		await user.click(await screen.findByText("Buy groceries"));

		expect(mockNavigateToTask).toHaveBeenCalledWith("proj-1", "task-1");
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

```bash
pnpm test src/components/layout/GlobalSearch.test.tsx
```

Expected: plusieurs tests FAIL (résultats pas encore rendus).

- [ ] **Step 3: Implémenter les résultats de tâches dans GlobalSearch.tsx**

Remplacer le contenu complet de `src/components/layout/GlobalSearch.tsx` :

```tsx
import { Dialog } from "@base-ui/react/dialog";
import { Command, useCommandState } from "cmdk";
import { ArchiveIcon, CheckIcon, CircleIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRepository } from "@/store/repository";
import { useProjectStore } from "@/store/projects";
import { useSearchStore } from "@/store/search";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

const TASK_LIMIT = 5;
const PROJECT_LIMIT = 3;
const TAG_LIMIT = 3;

// Tracks the currently selected cmdk item value and reports it to a ref.
// Must be rendered inside <Command>.
function SelectedValueTracker({
	onValueChange,
}: {
	onValueChange: (value: string) => void;
}) {
	const value = useCommandState((state) => state.value);
	useEffect(() => {
		onValueChange(value);
	}, [value, onValueChange]);
	return null;
}

export function GlobalSearch() {
	const { isOpen, close } = useSearchStore();
	const [query, setQuery] = useState("");
	const [quickActionTarget, setQuickActionTarget] = useState<Task | null>(null);
	const { t } = useTranslation();

	const tasks = useTaskStore((s) => s.tasks);
	const archivedTasks = useTaskStore((s) => s.archivedTasks);
	const loadArchivedTasks = useTaskStore((s) => s.loadArchivedTasks);
	const completeTask = useTaskStore((s) => s.completeTask);
	const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
	const archiveTask = useTaskStore((s) => s.archiveTask);
	const projects = useProjectStore((s) => s.projects);
	const tags = useTagStore((s) => s.tags);
	const navigateToTask = useUIStore((s) => s.navigateToTask);
	const setSelectedProject = useUIStore((s) => s.setSelectedProject);

	// Track currently selected cmdk item by value (task id)
	const selectedValueRef = useRef<string>("");

	// Load archived tasks on first open
	useEffect(() => {
		if (isOpen && archivedTasks.length === 0) {
			loadArchivedTasks(getRepository());
		}
	}, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

	function handleClose() {
		close();
		setQuery("");
		setQuickActionTarget(null);
	}

	const q = query.toLowerCase();

	const filteredTasks = useMemo(
		() =>
			[...tasks, ...archivedTasks]
				.filter((t) => t.title.toLowerCase().includes(q))
				.slice(0, TASK_LIMIT),
		[tasks, archivedTasks, q],
	);

	const filteredProjects = useMemo(
		() =>
			projects
				.filter((p) => p.name.toLowerCase().includes(q))
				.slice(0, PROJECT_LIMIT),
		[projects, q],
	);

	const filteredTags = useMemo(
		() =>
			tags
				.filter((tag) => tag.name.toLowerCase().includes(q))
				.slice(0, TAG_LIMIT),
		[tags, q],
	);

	function handleSelectTask(task: Task) {
		navigateToTask(task.projectId, task.id);
		handleClose();
	}

	function handleSelectProject(projectId: string) {
		setSelectedProject(projectId);
		handleClose();
	}

	function handleSelectTag() {
		setSelectedProject("tags");
		handleClose();
	}

	function handleTabOnCommand(e: React.KeyboardEvent) {
		if (e.key === "Tab" && !quickActionTarget) {
			const task = filteredTasks.find((t) => t.id === selectedValueRef.current);
			if (task) {
				e.preventDefault();
				setQuickActionTarget(task);
				setQuery("");
			}
		}
		if (e.key === "Escape" && quickActionTarget) {
			e.preventDefault();
			e.stopPropagation();
			setQuickActionTarget(null);
		}
	}

	async function handleQuickComplete(task: Task) {
		const repo = getRepository();
		if (task.completedAt) {
			await uncompleteTask(repo, task.id);
		} else {
			await completeTask(repo, task.id);
		}
		handleClose();
	}

	async function handleQuickArchive(task: Task) {
		await archiveTask(getRepository(), task.id);
		handleClose();
	}

	const taskBadge = (task: Task) => {
		if (task.deletedAt) return t("search.archived");
		if (task.completedAt) return t("search.completed");
		return null;
	};

	return (
		<Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
				<Dialog.Popup
					className={cn(
						"fixed left-1/2 top-[20%] z-50 w-full max-w-[580px] -translate-x-1/2 outline-none",
						"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
						"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
					)}
				>
					<Command
						shouldFilter={false}
						onKeyDown={handleTabOnCommand}
						className="overflow-hidden rounded-xl bg-popover shadow-2xl ring-1 ring-foreground/10"
					>
						<SelectedValueTracker
							onValueChange={(v) => {
								selectedValueRef.current = v;
							}}
						/>

						{/* Input */}
						<div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
							<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
							{quickActionTarget ? (
								<span className="flex-1 truncate text-sm text-foreground">
									{quickActionTarget.title}
								</span>
							) : (
								<Command.Input
									value={query}
									onValueChange={setQuery}
									placeholder={t("search.placeholder")}
									className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
									autoFocus
								/>
							)}
							<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
								ESC
							</kbd>
						</div>

						{/* Results */}
						<Command.List className="max-h-[380px] overflow-y-auto p-1">
							<Command.Empty className="py-8 text-center text-sm text-muted-foreground">
								{t("search.noResults")}
							</Command.Empty>

							{/* Quick actions mode */}
							{quickActionTarget && (
								<Command.Group heading={t("search.actionsHint")}>
									<Command.Item
										value="action-complete"
										onSelect={() => handleQuickComplete(quickActionTarget)}
										className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-selected:bg-accent"
									>
										<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-500">
											<CheckIcon className="size-3.5" />
										</span>
										{quickActionTarget.completedAt
											? t("search.uncomplete")
											: t("search.complete")}
									</Command.Item>
									<Command.Item
										value="action-archive"
										onSelect={() => handleQuickArchive(quickActionTarget)}
										className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-selected:bg-accent"
									>
										<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
											<ArchiveIcon className="size-3.5" />
										</span>
										{t("search.archive")}
									</Command.Item>
								</Command.Group>
							)}

							{/* Tasks */}
							{!quickActionTarget && filteredTasks.length > 0 && (
								<Command.Group
									heading={t("search.tasks")}
									className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
								>
									{filteredTasks.map((task) => {
										const badge = taskBadge(task);
										const isCompleted = Boolean(task.completedAt);
										return (
											<Command.Item
												key={task.id}
												value={task.id}
												onSelect={() => handleSelectTask(task)}
												className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-selected:bg-accent"
											>
												<span
													className={cn(
														"flex size-7 shrink-0 items-center justify-center rounded-md",
														isCompleted
															? "bg-green-500/10 text-green-500"
															: "bg-muted text-muted-foreground",
													)}
												>
													{isCompleted ? (
														<CheckIcon className="size-3.5" />
													) : (
														<CircleIcon className="size-3.5" />
													)}
												</span>
												<span className="min-w-0 flex-1">
													<span
														className={cn(
															"block truncate",
															isCompleted && "line-through text-muted-foreground",
														)}
													>
														{task.title}
													</span>
													{badge && (
														<span className="text-xs text-muted-foreground">
															{badge}
														</span>
													)}
												</span>
												<span className="hidden items-center gap-1 group-data-selected:flex">
													<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
														↵
													</kbd>
													<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
														⇥
													</kbd>
												</span>
											</Command.Item>
										);
									})}
								</Command.Group>
							)}

							{/* Projects */}
							{!quickActionTarget && filteredProjects.length > 0 && (
								<Command.Group
									heading={t("search.projects")}
									className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
								>
									{filteredProjects.map((project) => (
										<Command.Item
											key={project.id}
											value={`project-${project.id}`}
											onSelect={() => handleSelectProject(project.id)}
											className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-selected:bg-accent"
										>
											<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-base leading-none">
												{project.icon ?? "📋"}
											</span>
											<span className="truncate">{project.name}</span>
										</Command.Item>
									))}
								</Command.Group>
							)}

							{/* Tags */}
							{!quickActionTarget && filteredTags.length > 0 && (
								<Command.Group
									heading={t("search.tags")}
									className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
								>
									{filteredTags.map((tag) => (
										<Command.Item
											key={tag.id}
											value={`tag-${tag.id}`}
											onSelect={() => handleSelectTag()}
											className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-selected:bg-accent"
										>
											<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
												<span
													className="size-2.5 rounded-full"
													style={{ background: tag.color ?? "#71717a" }}
												/>
											</span>
											<span className="truncate">{tag.name}</span>
										</Command.Item>
									))}
								</Command.Group>
							)}
						</Command.List>

						{/* Footer hints */}
						{!quickActionTarget && (
							<div className="flex items-center gap-4 border-t border-border bg-muted/30 px-3 py-2">
								<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
									<kbd className="font-mono">↑↓</kbd>
									{t("search.navigateHint")}
								</span>
								<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
									<kbd className="font-mono">↵</kbd>
									{t("search.openHint")}
								</span>
								<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
									<kbd className="font-mono">⇥</kbd>
									{t("search.actionsHint")}
								</span>
							</div>
						)}
						{quickActionTarget && (
							<div className="flex items-center gap-4 border-t border-border bg-muted/30 px-3 py-2">
								<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
									<kbd className="font-mono">ESC</kbd>
									Retour
								</span>
							</div>
						)}
					</Command>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
```

- [ ] **Step 4: Lancer les tests**

```bash
pnpm test src/components/layout/GlobalSearch.test.tsx
```

Expected: tous les tests PASS.

- [ ] **Step 5: Vérifier la compilation**

```bash
pnpm exec tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 6: Lancer le linter**

```bash
pnpm lint
```

Si des avertissements biome apparaissent sur le `useEffect` avec des dépendances manquantes, ajouter le commentaire `// eslint-disable-line react-hooks/exhaustive-deps` déjà présent ailleurs dans le projet (biome accepte ces commentaires).

- [ ] **Step 7: Tester manuellement dans l'app**

```bash
pnpm tauri dev
```

- CTRL+K ouvre la palette
- Taper "buy" filtre les tâches par titre
- Résultats de projets et tags apparaissent si le query match
- Cliquer sur un résultat navigue et ferme la palette
- Tab sur une tâche sélectionnée (naviguer avec les flèches) affiche les actions rapides
- ESC en mode actions revient à la recherche
- ESC en mode recherche ferme la palette

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/GlobalSearch.tsx src/components/layout/GlobalSearch.test.tsx
git commit -m "feat: implement GlobalSearch with tasks, projects, tags and quick actions"
```

---

## Task 7: Lancer la suite de tests complète

**Files:** — (vérification uniquement)

- [ ] **Step 1: Lancer tous les tests**

```bash
pnpm test:run
```

Expected: tous les tests existants PASS, aucune régression.

- [ ] **Step 2: Si des tests échouent, investiguer**

Si un test existant échoue à cause d'un état de store partagé, vérifier que `beforeEach` dans les autres fichiers de test réinitialise bien les stores concernés. Les stores Zustand sont des singletons — un test peut polluer l'état du suivant si `setState` n'est pas appelé dans `beforeEach`.

---

## Self-Review Checklist

- [x] **spec.search.tasks** — Task 6, filteredTasks avec `[...tasks, ...archivedTasks]`
- [x] **spec.search.projects** — Task 6, filteredProjects
- [x] **spec.search.tags** — Task 6, filteredTags
- [x] **spec.navigateTask** — `navigateToTask(task.projectId, task.id)` dans `handleSelectTask`
- [x] **spec.navigateProject** — `setSelectedProject(project.id)` dans `handleSelectProject`
- [x] **spec.navigateTag** — `setSelectedProject("tags")` dans `handleSelectTag`
- [x] **spec.quickActions.complete** — `handleQuickComplete` dans Task 6
- [x] **spec.quickActions.archive** — `handleQuickArchive` dans Task 6
- [x] **spec.ctrl-k** — listener `document.addEventListener` dans AppShell, Task 5
- [x] **spec.esc-close** — `onOpenChange` du Dialog + `onKeyDown` en mode actions
- [x] **spec.i18n** — toutes les chaînes via `t()`, clés définies dans Task 2
- [x] **spec.archivedTasks** — `loadArchivedTasks` au premier `isOpen`, inclus dans `filteredTasks`
- [x] **spec.maxResults** — `TASK_LIMIT=5`, `PROJECT_LIMIT=3`, `TAG_LIMIT=3` + `.slice()`
- [x] **spec.groupHidden** — `filteredTasks.length > 0` conditionnel sur chaque groupe
