# Widget de bureau macOS — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à Bunly une vignette de tâches posée au niveau du bureau macOS (visible seulement quand le bureau l'est, cochable), pilotée par une icône de barre de menu, activable via un réglage désactivé par défaut, sans icône Dock permanente.

**Architecture:** Une 2ᵉ fenêtre WebView Tauri (`widget`) chargeant une entrée React mince, convertie en `NSPanel` au niveau bureau. Un seul processus, une seule base SQLite partagée directement entre fenêtres. Réactivité inter-fenêtres via un événement Tauri `tasks-changed` émis de façon centralisée par un décorateur de repository. Dock dynamique via `ActivationPolicy` + gestion des events de fenêtre.

**Tech Stack:** Tauri 2 (Rust), `tauri-nspanel` v2.1, `tauri-plugin-autostart` v2, feature `tray-icon`, React 19, Zustand, Vite (multi-page), Biome, Vitest.

**Spec de référence :** [docs/superpowers/specs/2026-07-16-widget-bureau-macos-design.md](../specs/2026-07-16-widget-bureau-macos-design.md)

## Global Constraints

- **Gestionnaire de paquets : pnpm** (jamais npm). Ex. `pnpm test`, `pnpm run lint:fix`.
- **Git géré par l'utilisateur** : ne jamais lancer de commande git en écriture. Les étapes « Checkpoint » ci-dessous sont des points où **l'utilisateur** committe ; l'agent ne committe pas.
- **Commentaires en anglais**, concis, seulement pour un _pourquoi_ non évident.
- **Types dans leur propre fichier** (exception : props non partagées d'un composant).
- **Plateforme** : le comportement natif (NSPanel, tray, activation policy, autostart) est **macOS uniquement** (`#[cfg(target_os = "macos")]`). Le reste doit compiler/dégrader proprement ailleurs.
- **Réglage `widgetEnabled` par défaut `false`.**
- **Fin de tâche projet** (après la dernière tâche de code) : changelog bilingue + `react-doctor` + `pnpm run lint:fix` (voir Task 13).

---

## File Structure

**Créés :**
- `src/types/widget.ts` — types `WidgetViewMode`, `WidgetView`.
- `src/db/init.ts` — `initDatabase()` (extraction de la logique DB d'`App.tsx`).
- `src/db/eventEmittingRepository.ts` — décorateur émettant `tasks-changed`.
- `src/hooks/useTasksChangedSync.ts` — écoute `tasks-changed` et recharge les tâches.
- `src/hooks/useWidgetLifecycle.ts` — crée/détruit le widget natif selon `widgetEnabled`.
- `widget.html` — entrée Vite de la fenêtre widget.
- `src/widget/main.tsx` — bootstrap React de la fenêtre widget.
- `src/widget/Widget.tsx` — coquille (DB, i18n, theme) de la fenêtre widget.
- `src/widget/WidgetContent.tsx` — sélecteur de vue + liste de tâches.
- `src/widget/WidgetDragHandle.tsx` — poignée de déplacement au survol.
- `src-tauri/src/widget.rs` — module natif (panel, tray, commandes, activation policy).
- `src-tauri/capabilities/widget.json` — permissions de la fenêtre `widget`.

**Modifiés :**
- `src/store/settings.ts` — `widgetEnabled`, `widgetView` + setters.
- `src/store/settings.test.ts` — tests des nouveaux réglages.
- `src/db/index.ts` — appliquer le décorateur dans `createRepository`.
- `src/App.tsx` — utiliser `initDatabase()`, brancher `useTasksChangedSync` + `useWidgetLifecycle`.
- `src/components/layout/SettingsDialog.tsx` — interrupteur du widget.
- `src/i18n/locales/en.ts`, `src/i18n/locales/fr.ts` — clés du widget.
- `vite.config.ts` — entrée multi-page `widget.html`.
- `src-tauri/Cargo.toml` — deps `tauri-nspanel`, `tauri-plugin-autostart`, feature `tray-icon`.
- `src-tauri/src/lib.rs` — enregistrer plugins/commandes/tray, activation policy, prevent-exit.
- `src-tauri/tauri.conf.json` — `main` en `visible: false`.
- `src/assets/changelog.json` — entrée `Unreleased`.

---

## Task 1: Réglages `widgetEnabled` et `widgetView`

Ajoute deux réglages persistés suivant le patron existant (paires clé/valeur, `=== "true"`, JSON pour l'objet). Aucune migration : `getSettings()` renvoie un `Record<string,string>`.

**Files:**
- Create: `src/types/widget.ts`
- Modify: `src/store/settings.ts`
- Test: `src/store/settings.test.ts`

**Interfaces:**
- Produces:
  - `WidgetViewMode = "today" | "all" | "projects"`
  - `WidgetView = { mode: WidgetViewMode; projectIds: string[] }`
  - `SettingsStore.widgetEnabled: boolean` (défaut `false`)
  - `SettingsStore.widgetView: WidgetView` (défaut `{ mode: "today", projectIds: [] }`)
  - `setWidgetEnabled(repo, enabled: boolean): Promise<void>` (clé `widget_enabled`)
  - `setWidgetView(repo, view: WidgetView): Promise<void>` (clé `widget_view`, JSON)

- [ ] **Step 1: Créer le fichier de types**

`src/types/widget.ts` :
```ts
export type WidgetViewMode = "today" | "all" | "projects";

export interface WidgetView {
	mode: WidgetViewMode;
	projectIds: string[];
}
```

- [ ] **Step 2: Écrire les tests (échouent)**

Ajouter dans `src/store/settings.test.ts` (suivre le style des tests existants, avec un `repo` factice exposant `getSettings`/`setSetting`) :
```ts
it("defaults widgetEnabled to false and widgetView to today", () => {
	const s = useSettingsStore.getState();
	expect(s.widgetEnabled).toBe(false);
	expect(s.widgetView).toEqual({ mode: "today", projectIds: [] });
});

it("persists and reflects widgetEnabled", async () => {
	const repo = makeRepo({}); // helper existant du fichier
	await useSettingsStore.getState().setWidgetEnabled(repo, true);
	expect(repo.setSetting).toHaveBeenCalledWith("widget_enabled", "true");
	expect(useSettingsStore.getState().widgetEnabled).toBe(true);
});

it("persists widgetView as JSON", async () => {
	const repo = makeRepo({});
	const view = { mode: "projects" as const, projectIds: ["p1", "p2"] };
	await useSettingsStore.getState().setWidgetView(repo, view);
	expect(repo.setSetting).toHaveBeenCalledWith(
		"widget_view",
		JSON.stringify(view),
	);
	expect(useSettingsStore.getState().widgetView).toEqual(view);
});

it("loads widget settings from raw values", async () => {
	const repo = makeRepo({
		widget_enabled: "true",
		widget_view: JSON.stringify({ mode: "all", projectIds: [] }),
	});
	await useSettingsStore.getState().loadSettings(repo);
	expect(useSettingsStore.getState().widgetEnabled).toBe(true);
	expect(useSettingsStore.getState().widgetView).toEqual({
		mode: "all",
		projectIds: [],
	});
});
```
> Si `makeRepo` n'existe pas sous ce nom, réutiliser le helper de fabrique de repo déjà présent dans le fichier (mêmes conventions que les tests `glassmorphism`).

- [ ] **Step 3: Vérifier l'échec**

Run: `pnpm test -- src/store/settings.test.ts`
Expected: FAIL (`widgetEnabled`/`setWidgetEnabled` undefined).

- [ ] **Step 4: Implémenter dans le store**

Dans `src/store/settings.ts` : importer le type, étendre l'interface, l'état initial, `loadSettings`, et ajouter les setters.
```ts
import type { WidgetView } from "@/types/widget";
```
Interface (ajouter) :
```ts
	widgetEnabled: boolean;
	widgetView: WidgetView;
	setWidgetEnabled(repo: TodoRepository, enabled: boolean): Promise<void>;
	setWidgetView(repo: TodoRepository, view: WidgetView): Promise<void>;
```
État initial (ajouter dans l'objet `create(...)`) :
```ts
	widgetEnabled: false,
	widgetView: { mode: "today", projectIds: [] },
```
Dans `loadSettings`, après les autres parsings :
```ts
	const widgetEnabled = raw.widget_enabled === "true";
	const widgetView: WidgetView = raw.widget_view
		? (JSON.parse(raw.widget_view) as WidgetView)
		: { mode: "today", projectIds: [] };
```
Puis les ajouter à l'objet passé à `set({ ... })`. Setters :
```ts
	async setWidgetEnabled(repo, enabled) {
		await repo.setSetting("widget_enabled", String(enabled));
		set({ widgetEnabled: enabled });
	},

	async setWidgetView(repo, view) {
		await repo.setSetting("widget_view", JSON.stringify(view));
		set({ widgetView: view });
	},
```

- [ ] **Step 5: Vérifier le succès**

Run: `pnpm test -- src/store/settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint** (l'utilisateur committe : `feat: add widget settings (enabled + view)`).

---

## Task 2: Réactivité inter-fenêtres via `tasks-changed`

Un décorateur enveloppe le repository et émet un événement Tauri `tasks-changed` après chaque mutation de tâche. Un hook écoute cet événement et recharge la liste. Le `SqliteRepository` reste pur/testable ; le décorateur porte le couplage Tauri.

**Files:**
- Create: `src/db/eventEmittingRepository.ts`
- Create: `src/hooks/useTasksChangedSync.ts`
- Test: `src/db/eventEmittingRepository.test.ts`

**Interfaces:**
- Consumes: `TodoRepository` (de `@/db/repository`), `emit` de `@tauri-apps/api/event`.
- Produces:
  - `withTasksChangedEvents(repo: TodoRepository): TodoRepository`
  - `TASKS_CHANGED_EVENT = "tasks-changed"`
  - `useTasksChangedSync(reload: () => void): void`

- [ ] **Step 1: Écrire le test (échoue)**

`src/db/eventEmittingRepository.test.ts` :
```ts
import { describe, expect, it, vi } from "vitest";

const emit = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({ emit: (...a: unknown[]) => emit(...a) }));

import {
	TASKS_CHANGED_EVENT,
	withTasksChangedEvents,
} from "./eventEmittingRepository";

function fakeRepo() {
	return {
		completeTask: vi.fn(async () => ({ id: "t1" }) as never),
		getTasks: vi.fn(async () => []),
	} as unknown as import("./repository").TodoRepository;
}

describe("withTasksChangedEvents", () => {
	it("emits tasks-changed after a mutation", async () => {
		emit.mockClear();
		const repo = withTasksChangedEvents(fakeRepo());
		await repo.completeTask("t1");
		expect(emit).toHaveBeenCalledWith(TASKS_CHANGED_EVENT);
	});

	it("does not emit on a read", async () => {
		emit.mockClear();
		const repo = withTasksChangedEvents(fakeRepo());
		await repo.getTasks();
		expect(emit).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm test -- src/db/eventEmittingRepository.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter le décorateur**

`src/db/eventEmittingRepository.ts` :
```ts
import { emit } from "@tauri-apps/api/event";
import type { TodoRepository } from "./repository";

export const TASKS_CHANGED_EVENT = "tasks-changed";

// Task mutations that other windows must react to. Reads are left untouched.
const MUTATING_METHODS: (keyof TodoRepository)[] = [
	"createTask",
	"updateTask",
	"moveTasksToProject",
	"completeTask",
	"uncompleteTask",
	"archiveTask",
	"deleteTask",
	"unarchiveTask",
	"reorderTasks",
	"bulkImport",
];

// Wraps a repository so every task mutation broadcasts `tasks-changed` to all
// windows. Centralized here so no call site can forget to notify.
export function withTasksChangedEvents(repo: TodoRepository): TodoRepository {
	return new Proxy(repo, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (
				typeof value === "function" &&
				MUTATING_METHODS.includes(prop as keyof TodoRepository)
			) {
				return async (...args: unknown[]) => {
					const result = await (value as (...a: unknown[]) => unknown).apply(
						target,
						args,
					);
					await emit(TASKS_CHANGED_EVENT);
					return result;
				};
			}
			return value;
		},
	});
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `pnpm test -- src/db/eventEmittingRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Créer le hook d'écoute**

`src/hooks/useTasksChangedSync.ts` :
```ts
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { TASKS_CHANGED_EVENT } from "@/db/eventEmittingRepository";

// Reloads the current window's task list whenever any window mutates tasks.
export function useTasksChangedSync(reload: () => void) {
	useEffect(() => {
		const unlisten = listen(TASKS_CHANGED_EVENT, () => reload());
		return () => {
			unlisten.then((off) => off());
		};
	}, [reload]);
}
```

- [ ] **Step 6: Checkpoint** (`feat: broadcast tasks-changed across windows`).

---

## Task 3: Extraire l'initialisation DB dans `src/db/init.ts`

`App.tsx` porte aujourd'hui la logique de chargement DB + migrations. On l'extrait pour que la fenêtre widget la réutilise sans duplication, et on y branche le décorateur de la Task 2.

**Files:**
- Create: `src/db/init.ts`
- Modify: `src/db/index.ts`
- Modify: `src/App.tsx:97-147` (fonction `init`)

**Interfaces:**
- Produces: `initDatabase(): Promise<TodoRepository>` (charge la DB, applique les migrations, renvoie le repo décoré).
- Modifie `createRepository` pour appliquer `withTasksChangedEvents`.

- [ ] **Step 1: Décorer dans `createRepository`**

`src/db/index.ts` — envelopper le repo :
```ts
import { withTasksChangedEvents } from "./eventEmittingRepository";
// ...
export function createRepository(db: Database): TodoRepository {
	return withTasksChangedEvents(new SqliteRepository(adaptDatabase(db)));
}
```

- [ ] **Step 2: Créer `initDatabase()`**

`src/db/init.ts` — déplacer la logique de `App.tsx` (migrations incluses) :
```ts
import Database from "@tauri-apps/plugin-sql";
import migrationSql from "@/db/migrations/001_initial.sql?raw";
import migration002 from "@/db/migrations/002_add_description.sql?raw";
import migration003 from "@/db/migrations/003_settings.sql?raw";
import migration004 from "@/db/migrations/004_tags_project_scope.sql?raw";
import migration005 from "@/db/migrations/005_project_groups.sql?raw";
import migration006 from "@/db/migrations/006_extend_priority.sql?raw";
import { createRepository, type TodoRepository } from "@/db";

// Loads the SQLite DB, applies pending migrations exactly once (tracked via
// PRAGMA user_version), and returns the app repository.
export async function initDatabase(): Promise<TodoRepository> {
	const db = await Database.load("sqlite:usagi.db");
	const migrations = [
		migrationSql,
		migration002,
		migration003,
		migration004,
		migration005,
		migration006,
	];
	const versionRows = await db.select<{ user_version: number }[]>(
		"PRAGMA user_version",
	);
	const applied = versionRows[0]?.user_version ?? 0;
	for (let version = applied; version < migrations.length; version++) {
		for (const statement of migrations[version].split(";").flatMap((s) => {
			const trimmed = s.trim();
			return trimmed ? [trimmed] : [];
		})) {
			await db.execute(statement).catch(() => {
				// Ignore "duplicate column" from ALTER re-runs on legacy DBs whose
				// user_version was never advanced.
			});
		}
		await db.execute(`PRAGMA user_version = ${version + 1}`);
	}
	return createRepository(db);
}
```

- [ ] **Step 3: Utiliser `initDatabase()` dans `App.tsx`**

Remplacer le corps de la fonction `init` (les migrations + `Database.load`) par :
```ts
setRepository(await initDatabase());
setReady(true);
```
Ajouter l'import `import { initDatabase } from "@/db/init";` et retirer les imports de migrations et `Database`/`createRepository` désormais inutilisés dans `App.tsx`. Conserver le garde `initStarted` (StrictMode).

- [ ] **Step 4: Vérifier build + tests**

Run: `pnpm test:run && pnpm build`
Expected: build OK, suite verte (aucune régression).

- [ ] **Step 5: Checkpoint** (`refactor: extract initDatabase for reuse by widget window`).

---

## Task 4: Entrée Vite multi-page + coquille de la fenêtre widget

La fenêtre `widget` charge `widget.html` → `src/widget/main.tsx` → `Widget.tsx`, qui initialise DB/i18n/theme puis rend `WidgetContent` (Task 5).

**Files:**
- Modify: `vite.config.ts`
- Create: `widget.html`
- Create: `src/widget/main.tsx`
- Create: `src/widget/Widget.tsx`

**Interfaces:**
- Consumes: `initDatabase`, `setRepository`, `getRepository`, `ThemeProvider`, stores.
- Produces: la page `widget.html` (buildée dans `dist/widget.html`), composant `Widget`.

- [ ] **Step 1: Déclarer l'entrée multi-page**

`vite.config.ts` — ajouter, après `resolve` :
```ts
	build: {
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, "index.html"),
				widget: path.resolve(__dirname, "widget.html"),
			},
		},
	},
```

- [ ] **Step 2: Créer `widget.html`**

À la racine du projet (copie d'`index.html` pointant vers l'entrée widget) :
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bunly Widget</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/widget/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Créer `src/widget/main.tsx`**

```tsx
import "@/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import { Widget } from "./Widget";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Widget />
	</React.StrictMode>,
);
```

- [ ] **Step 4: Créer `src/widget/Widget.tsx`**

Coquille : init DB (comme `App`), fournit le theme, monte `WidgetContent`.
```tsx
import { useEffect, useRef, useState } from "react";
import { initDatabase } from "@/db/init";
import { setRepository } from "@/store/repository";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { WidgetContent } from "./WidgetContent";

export function Widget() {
	const [ready, setReady] = useState(false);
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		initDatabase().then((repo) => {
			setRepository(repo);
			setReady(true);
		});
	}, []);

	if (!ready) return null;

	return (
		<ThemeProvider>
			<div className="h-screen w-screen overflow-hidden bg-transparent">
				<WidgetContent />
			</div>
		</ThemeProvider>
	);
}
```
> Stub temporaire pour compiler avant la Task 5 : `export function WidgetContent() { return null; }` dans `src/widget/WidgetContent.tsx` (remplacé en Task 5).

- [ ] **Step 5: Vérifier le build**

Run: `pnpm build`
Expected: `dist/widget.html` généré, pas d'erreur TS.

- [ ] **Step 6: Checkpoint** (`feat: add widget window entry (vite multi-page)`).

---

## Task 5: Contenu du widget — sélecteur de vue + liste cochable

La vue rend un sélecteur (Aujourd'hui / Toutes / par projet, réutilisant `ProjectFilter`) et la liste des tâches via `TaskItem`. Le choix de vue est persisté (`setWidgetView`). Le rechargement inter-fenêtres passe par `useTasksChangedSync`.

**Files:**
- Modify: `src/widget/WidgetContent.tsx`
- Test: `src/widget/WidgetContent.test.tsx`

**Interfaces:**
- Consumes: `useTaskStore`, `useSettingsStore`, `getRepository`, `ProjectFilter`, `TaskItem`, `useTasksChangedSync`, `WidgetView`, `todayIso`.
- Produces: `WidgetContent` (composant par défaut nommé).

- [ ] **Step 1: Écrire le test (échoue)**

`src/widget/WidgetContent.test.tsx` — vérifier que les tâches se chargent selon la vue et que le rendu liste apparaît. Mock du store de tâches et du repo (suivre `src/test/TaskList.test.tsx` pour les patterns de mock/i18n).
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
	emit: vi.fn(),
	listen: vi.fn(async () => () => {}),
}));

// ... monter WidgetContent avec un store de tâches contenant 1 tâche "Acheter du pain"
describe("WidgetContent", () => {
	it("renders the task list", async () => {
		// arrange store + repo mocks (voir helpers existants)
		render(<WidgetContent />);
		expect(await screen.findByText("Acheter du pain")).toBeInTheDocument();
	});
});
```
> Adapter aux helpers de test réellement présents (mocks de `getRepository`, `useTaskStore`). Le point clé testé : la liste se rend et `useTasksChangedSync` est branché sans planter (event mocké).

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm test -- src/widget/WidgetContent.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implémenter le contenu**

`src/widget/WidgetContent.tsx` :
```tsx
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ProjectFilter } from "@/components/tasks/ProjectFilter";
import { TaskItem } from "@/components/tasks/TaskItem";
import { Button } from "@/components/ui/button";
import { useTasksChangedSync } from "@/hooks/useTasksChangedSync";
import { todayIso } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useTaskStore } from "@/store/tasks";
import type { TaskFilters } from "@/types";
import type { WidgetView } from "@/types/widget";

// Maps the persisted widget view to repository task filters.
function filtersForView(view: WidgetView): TaskFilters {
	if (view.mode === "today") return { dueBefore: todayIso() };
	if (view.mode === "projects" && view.projectIds.length > 0)
		return { projectIds: view.projectIds };
	return {};
}

export function WidgetContent() {
	const { t } = useTranslation();
	const tasks = useTaskStore((s) => s.tasks);
	const loadTasks = useTaskStore((s) => s.loadTasks);
	const widgetView = useSettingsStore((s) => s.widgetView);
	const setWidgetView = useSettingsStore((s) => s.setWidgetView);

	const filters = useMemo(() => filtersForView(widgetView), [widgetView]);

	const reload = useMemo(
		() => () => loadTasks(getRepository(), filters),
		[loadTasks, filters],
	);
	useEffect(() => reload(), [reload]);
	useTasksChangedSync(reload);

	function setMode(mode: WidgetView["mode"]) {
		setWidgetView(getRepository(), { mode, projectIds: [] });
	}

	return (
		<div className="flex h-full flex-col gap-2 p-3">
			<div className="flex items-center gap-1">
				<Button
					variant={widgetView.mode === "today" ? "default" : "ghost"}
					size="sm"
					onClick={() => setMode("today")}
				>
					{t("widget.viewToday")}
				</Button>
				<Button
					variant={widgetView.mode === "all" ? "default" : "ghost"}
					size="sm"
					onClick={() => setMode("all")}
				>
					{t("widget.viewAll")}
				</Button>
				<ProjectFilter
					value={
						widgetView.mode === "projects" ? widgetView.projectIds : null
					}
					onChange={(ids) =>
						setWidgetView(getRepository(), {
							mode: "projects",
							projectIds: ids ?? [],
						})
					}
				/>
			</div>
			<div className="flex-1 space-y-1 overflow-y-auto">
				{tasks.map((task) => (
					<TaskItem key={task.id} task={task} onDeleteRequest={() => {}} />
				))}
			</div>
		</div>
	);
}
```
> Clés i18n `widget.viewToday` / `widget.viewAll` ajoutées en Task 12. `TaskItem` utilise `useSortable` (dnd-kit) : s'il exige un `DndContext` parent au montage, envelopper la liste dans un `<DndContext>` minimal (import depuis `@dnd-kit/core`) sans handlers — vérifier au premier rendu et ajouter si nécessaire.

- [ ] **Step 4: Vérifier le succès**

Run: `pnpm test -- src/widget/WidgetContent.test.tsx`
Expected: PASS.

- [ ] **Step 5: Checkpoint** (`feat: widget content with view selector and checkable tasks`).

---

## Task 6: Poignée de déplacement au survol

Un fin bandeau translucide, révélé au survol, portant `data-tauri-drag-region` pour déplacer la fenêtre sans barre de titre.

**Files:**
- Create: `src/widget/WidgetDragHandle.tsx`
- Modify: `src/widget/Widget.tsx`

**Interfaces:**
- Produces: `WidgetDragHandle` (composant sans props).

- [ ] **Step 1: Créer la poignée**

`src/widget/WidgetDragHandle.tsx` :
```tsx
// A hover-revealed drag strip. `data-tauri-drag-region` lets the borderless
// window be moved by dragging this element.
export function WidgetDragHandle() {
	return (
		<div
			data-tauri-drag-region
			className="group absolute inset-x-0 top-0 z-10 flex h-4 cursor-grab items-center justify-center active:cursor-grabbing"
		>
			<div className="h-1 w-8 rounded-full bg-foreground/20 opacity-0 transition-opacity group-hover:opacity-100" />
		</div>
	);
}
```

- [ ] **Step 2: Monter la poignée dans le widget**

Dans `src/widget/Widget.tsx`, à l'intérieur du conteneur plein écran, avant `<WidgetContent />` :
```tsx
import { WidgetDragHandle } from "./WidgetDragHandle";
// ...
<div className="relative h-screen w-screen overflow-hidden bg-transparent">
	<WidgetDragHandle />
	<WidgetContent />
</div>
```

- [ ] **Step 3: Vérifier le build**

Run: `pnpm build`
Expected: OK.

- [ ] **Step 4: Checkpoint** (`feat: hover drag handle for widget window`).

---

## Task 7: Dépendances Rust + enregistrement des plugins + base activation policy

Ajoute `tauri-nspanel`, `tauri-plugin-autostart`, active la feature `tray-icon`, met `main` en `visible: false`, et pose l'`ActivationPolicy::Accessory` par défaut. **macOS only** pour le natif.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/widget.rs` (squelette)

**Interfaces:**
- Produces: module `widget` avec `pub fn setup(app: &AppHandle)` (étoffé aux tâches suivantes).

- [ ] **Step 1: Ajouter les dépendances**

`src-tauri/Cargo.toml` — activer la feature tray sur tauri et ajouter les crates :
```toml
tauri = { version = "2", features = ["tray-icon"] }
```
Ajouter dans `[dependencies]` :
```toml
tauri-plugin-autostart = "2"
```
Ajouter la cible macOS (nspanel est macOS-only). Sous le bloc `[target.'cfg(target_os = "macos")'.dependencies]` existant :
```toml
tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }
```

- [ ] **Step 2: Masquer la fenêtre main au démarrage**

`src-tauri/tauri.conf.json` — dans l'objet window `main`, ajouter `"visible": false` (elle sera affichée par le code selon le contexte de lancement, Task 10).

- [ ] **Step 3: Créer le module widget (squelette)**

`src-tauri/src/widget.rs` :
```rust
use tauri::AppHandle;

// macOS-only desktop widget wiring: NSPanel, tray, activation policy.
#[cfg(target_os = "macos")]
pub fn setup(_app: &AppHandle) {
	// Filled in by later tasks.
}

#[cfg(not(target_os = "macos"))]
pub fn setup(_app: &AppHandle) {}
```

- [ ] **Step 4: Enregistrer plugins + module dans `lib.rs`**

Dans `src-tauri/src/lib.rs`, ajouter `mod widget;` en tête (près de `mod updater;`), et enregistrer les plugins dans le builder desktop :
```rust
	#[cfg(desktop)]
	let builder = builder
		.plugin(tauri_plugin_process::init())
		.plugin(tauri_plugin_http::init())
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_autostart::init(
			tauri_plugin_autostart::MacosLauncher::LaunchAgent,
			Some(vec!["--autostart"]),
		));
```
Ajouter le plugin nspanel (macOS only) — juste après, gardé :
```rust
	#[cfg(target_os = "macos")]
	let builder = builder.plugin(tauri_nspanel::init());
```
Dans `.setup(...)` (ajouter un `.setup` au builder s'il n'existe pas) :
```rust
	let builder = builder.setup(|app| {
		app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory);
		widget::setup(app.handle());
		Ok(())
	});
```

- [ ] **Step 5: Compiler**

Run: `pnpm tauri build --debug` (ou `cargo build` dans `src-tauri`)
Expected: compile sans erreur (widget non encore fonctionnel).

- [ ] **Step 6: Checkpoint** (`chore: add nspanel + autostart deps and register plugins`).

---

## Task 8: Icône de barre de menu + menu

Ajoute un `TrayIcon` avec le menu : *Afficher/Masquer le widget*, *Ouvrir Bunly*, *Quitter*.

**Files:**
- Modify: `src-tauri/src/widget.rs`

**Interfaces:**
- Consumes: `create_widget`/`destroy_widget` (Task 9) via `AppHandle` — pour l'instant, câbler *Ouvrir Bunly* et *Quitter*, laisser *Afficher/Masquer* appeler les fonctions de la Task 9 (ajoutées ensuite).
- Produces: tray construit dans `setup`.

- [ ] **Step 1: Construire le tray dans `setup`**

Dans `src-tauri/src/widget.rs` (bloc macOS), remplacer le corps de `setup` :
```rust
use tauri::{
	menu::{MenuBuilder, MenuItemBuilder},
	tray::TrayIconBuilder,
	AppHandle, Manager,
};

#[cfg(target_os = "macos")]
pub fn setup(app: &AppHandle) {
	let toggle = MenuItemBuilder::with_id("widget_toggle", "Afficher/Masquer le widget")
		.build(app)
		.unwrap();
	let open = MenuItemBuilder::with_id("open_main", "Ouvrir Bunly")
		.build(app)
		.unwrap();
	let quit = MenuItemBuilder::with_id("quit", "Quitter").build(app).unwrap();
	let menu = MenuBuilder::new(app)
		.items(&[&toggle, &open, &quit])
		.build()
		.unwrap();

	let _tray = TrayIconBuilder::with_id("main-tray")
		.icon(app.default_window_icon().unwrap().clone())
		.menu(&menu)
		.on_menu_event(|app, event| match event.id().as_ref() {
			"open_main" => show_main(app),
			"widget_toggle" => toggle_widget(app),
			"quit" => {
				app.exit(0);
			}
			_ => {}
		})
		.build(app)
		.unwrap();
}

// Shows the main window and switches to a regular (dock-visible) app.
pub fn show_main(app: &AppHandle) {
	if let Some(win) = app.get_webview_window("main") {
		let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
		let _ = win.show();
		let _ = win.set_focus();
	}
}
```
> `toggle_widget` est défini en Task 9. Pour compiler cette tâche isolément, ajouter temporairement `pub fn toggle_widget(_app: &AppHandle) {}` (remplacé en Task 9).

- [ ] **Step 2: Compiler**

Run: `cargo build` (dans `src-tauri`)
Expected: OK. Icône présente dans la barre de menu au lancement.

- [ ] **Step 3: Vérification manuelle**

Lancer `pnpm tauri dev`. Attendu : icône dans la barre de menu ; *Ouvrir Bunly* affiche la fenêtre et fait apparaître l'icône Dock ; *Quitter* ferme l'app.

- [ ] **Step 4: Checkpoint** (`feat: menu bar tray with widget/app/quit actions`).

---

## Task 9: Commandes `create_widget` / `destroy_widget` (NSPanel niveau bureau)

Crée la fenêtre `widget` comme `NSPanel` au niveau bureau, sur tous les Spaces, non-activante, transparente. Expose des commandes invocables depuis le JS.

**Files:**
- Modify: `src-tauri/src/widget.rs`
- Modify: `src-tauri/src/lib.rs` (enregistrer les commandes)
- Create: `src-tauri/capabilities/widget.json`

**Interfaces:**
- Produces (Rust commands, invocables JS) :
  - `create_widget(app: AppHandle) -> Result<(), String>`
  - `destroy_widget(app: AppHandle) -> Result<(), String>`
  - `toggle_widget(app: &AppHandle)` (helper interne, utilisé par le tray)

- [ ] **Step 1: Déclarer le type de panneau + les commandes**

En tête de `src-tauri/src/widget.rs` (bloc macOS), déclarer le panneau via la macro :
```rust
use tauri_nspanel::{
	tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask,
};
use tauri::{WebviewUrl, Manager};

tauri_panel! {
	panel!(WidgetPanel {
		config: {
			can_become_key_window: true,
			can_become_main_window: false,
			is_floating_panel: false
		}
	})
}

// kCGDesktopWindowLevel: sits above the wallpaper but below normal app windows,
// so open apps cover the widget and it's visible only on a cleared desktop.
// Tune this value manually if it ends up hidden behind desktop icons.
const DESKTOP_LEVEL: i32 = -2_147_483_623;
```

- [ ] **Step 2: Implémenter `create_widget` / `destroy_widget` / `toggle_widget`**

```rust
#[tauri::command]
pub fn create_widget(app: AppHandle) -> Result<(), String> {
	// Reuse the panel if it already exists.
	if let Ok(panel) = app.get_webview_panel("widget") {
		panel.show();
		return Ok(());
	}

	let panel = PanelBuilder::<_, WidgetPanel>::new(&app, "widget")
		.url(WebviewUrl::App("widget.html".into()))
		.title("Bunly Widget")
		.size(tauri::Size::Logical(tauri::LogicalSize {
			width: 320.0,
			height: 420.0,
		}))
		.no_activate(true)
		.with_window(|w| {
			w.decorations(false)
				.transparent(true)
				.skip_taskbar(true)
				.background_color(tauri::window::Color(0, 0, 0, 0))
		})
		.build()
		.map_err(|e| e.to_string())?;

	panel.set_level(PanelLevel::Custom(DESKTOP_LEVEL).value());
	panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
	panel.set_collection_behavior(
		CollectionBehavior::new()
			.can_join_all_spaces()
			.stationary()
			.into(),
	);
	panel.set_hides_on_deactivate(false);
	panel.show();
	Ok(())
}

#[tauri::command]
pub fn destroy_widget(app: AppHandle) -> Result<(), String> {
	if let Ok(panel) = app.get_webview_panel("widget") {
		panel.close();
	}
	Ok(())
}

pub fn toggle_widget(app: &AppHandle) {
	if let Ok(panel) = app.get_webview_panel("widget") {
		if panel.is_visible() {
			panel.order_out(None);
		} else {
			panel.show();
		}
	} else {
		let _ = create_widget(app.clone());
	}
}
```
> Retirer le stub temporaire `toggle_widget` de la Task 8. Les noms exacts (`get_webview_panel`, `order_out`, `.value()`, `.into()`) suivent l'API `tauri-nspanel` v2.1 ; ajuster si le compilateur signale une signature différente (voir la doc du crate).

- [ ] **Step 3: Enregistrer les commandes**

`src-tauri/src/lib.rs` — ajouter à `generate_handler!` (bloc desktop) :
```rust
			send_app_notification,
			updater::check_update,
			updater::install_update,
			widget::create_widget,
			widget::destroy_widget
```

- [ ] **Step 4: Capability de la fenêtre widget**

`src-tauri/capabilities/widget.json` :
```json
{
	"$schema": "../gen/schemas/desktop-schema.json",
	"identifier": "widget",
	"description": "Widget window capability",
	"windows": ["widget"],
	"permissions": [
		"core:default",
		"core:window:allow-start-dragging",
		"sql:allow-execute",
		"sql:allow-select",
		"sql:allow-load",
		"sql:allow-close",
		"event:default"
	]
}
```
> Ajouter aussi `"event:default"` à `capabilities/default.json` (fenêtre `main`) si l'émission/écoute `tasks-changed` y est refusée au runtime.

- [ ] **Step 5: Compiler + vérification manuelle**

Run: `cargo build` puis `pnpm tauri dev`.
Depuis la console JS de la fenêtre main : `await window.__TAURI__.core.invoke("create_widget")`.
Attendu : la vignette apparaît sur le bureau, translucide ; se cache derrière les fenêtres d'apps ouvertes ; visible quand le bureau est dégagé ; présente sur tous les Spaces. **Ajuster `DESKTOP_LEVEL`** si elle passe derrière les icônes du bureau de façon gênante.

- [ ] **Step 6: Checkpoint** (`feat: create desktop-level NSPanel widget window`).

---

## Task 10: Dock dynamique + survie en arrière-plan + lancement au login

Retour en `Accessory` à la fermeture de `main`, non-quit quand `main` se ferme (le tray/widget survit), et détection du lancement au login (`--autostart`) pour ne pas afficher `main`.

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/widget.rs`

**Interfaces:**
- Consumes: `show_main`, `create_widget`.
- Produces: gestion `on_window_event` (CloseRequested de `main`) + `RunEvent::ExitRequested`.

- [ ] **Step 1: Affichage conditionnel au démarrage**

Dans `.setup(...)` de `lib.rs`, après `widget::setup(...)` :
```rust
		let launched_at_login = std::env::args().any(|a| a == "--autostart");
		if launched_at_login {
			// Background start: keep dock hidden, show only the widget if enabled.
			let _ = app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory);
		} else if let Some(win) = app.get_webview_window("main") {
			let _ = app.handle().set_activation_policy(tauri::ActivationPolicy::Regular);
			let _ = win.show();
		}
```
> La création du widget selon `widgetEnabled` est pilotée côté JS (Task 11), qui lit le réglage en base et invoque `create_widget`.

- [ ] **Step 2: Ne pas quitter à la fermeture de `main`**

Ajouter au builder un `.on_window_event` :
```rust
	.on_window_event(|window, event| {
		if window.label() == "main" {
			if let tauri::WindowEvent::CloseRequested { api, .. } = event {
				// Hide instead of destroy; keep the app alive for tray + widget.
				api.prevent_close();
				let _ = window.hide();
				let _ = window
					.app_handle()
					.set_activation_policy(tauri::ActivationPolicy::Accessory);
			}
		}
	})
```

- [ ] **Step 3: Empêcher la sortie tant que le tray vit**

Remplacer `.run(tauri::generate_context!())...` par une variante gérant les events :
```rust
	builder
		.build(tauri::generate_context!())
		.expect("error while running tauri application")
		.run(|_app, event| {
			if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
				// Only the tray "Quitter" (app.exit) sets a code; otherwise stay alive.
				if code.is_none() {
					api.prevent_exit();
				}
			}
		});
```

- [ ] **Step 4: Compiler + vérification manuelle**

Run: `cargo build` puis `pnpm tauri dev`.
Attendu : fermer la fenêtre principale → l'icône Dock disparaît, l'app reste vivante (tray présent) ; *Ouvrir Bunly* la ré-affiche + Dock réapparaît ; *Quitter* ferme vraiment.

- [ ] **Step 5: Checkpoint** (`feat: dynamic dock policy and background survival`).

---

## Task 11: Pilotage par le réglage + couplage autostart (JS)

Un hook côté React invoque `create_widget`/`destroy_widget` et active/désactive l'autostart selon `widgetEnabled`, au démarrage et à chaque changement.

**Files:**
- Create: `src/hooks/useWidgetLifecycle.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `invoke` (`@tauri-apps/api/core`), `enable`/`disable`/`isEnabled` (`@tauri-apps/plugin-autostart`), `useSettingsStore`.
- Produces: `useWidgetLifecycle(): void`.

- [ ] **Step 1: Ajouter le paquet autostart JS**

Run: `pnpm add @tauri-apps/plugin-autostart`

- [ ] **Step 2: Créer le hook**

`src/hooks/useWidgetLifecycle.ts` :
```ts
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings";

// Reflects the `widgetEnabled` setting into the native world: creates/destroys
// the desktop widget and couples launch-at-login to it.
export function useWidgetLifecycle() {
	const widgetEnabled = useSettingsStore((s) => s.widgetEnabled);

	useEffect(() => {
		let cancelled = false;
		async function sync() {
			if (widgetEnabled) {
				await invoke("create_widget");
				if (!(await isEnabled())) await enable();
			} else {
				await invoke("destroy_widget");
				if (await isEnabled()) await disable();
			}
		}
		if (!cancelled) sync().catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [widgetEnabled]);
}
```

- [ ] **Step 3: Brancher dans `AppContent`**

Dans `src/App.tsx`, `AppContent` : appeler `useWidgetLifecycle()` (après `useOverdueNotifications`), et brancher la réactivité de la fenêtre principale sur les changements venus du widget :
```ts
import { useWidgetLifecycle } from "@/hooks/useWidgetLifecycle";
import { useTasksChangedSync } from "@/hooks/useTasksChangedSync";
// ... dans AppContent :
useWidgetLifecycle();
const loadTasksFn = useTaskStore((s) => s.loadTasks);
useTasksChangedSync(() => loadTasksFn(getRepository(), {}));
```
> `useWidgetLifecycle` ne s'exécute qu'après `loadSettings` (le premier rendu a `widgetEnabled=false` puis se resynchronise quand le réglage chargé change).

- [ ] **Step 4: Vérifier build + tests**

Run: `pnpm test:run && pnpm build`
Expected: OK.

- [ ] **Step 5: Vérification manuelle**

`pnpm tauri dev`, activer le widget (temporairement en base ou via la Task 12). Attendu : le widget apparaît ; le désactiver le fait disparaître et retire l'entrée de démarrage.

- [ ] **Step 6: Checkpoint** (`feat: drive widget + autostart from setting`).

---

## Task 12: Interrupteur dans les paramètres + i18n

Ajoute l'interrupteur du widget dans `SettingsDialog` (section Apparence) et les clés i18n.

**Files:**
- Modify: `src/components/layout/SettingsDialog.tsx`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/fr.ts`

**Interfaces:**
- Consumes: `useSettingsStore.widgetEnabled`, `setWidgetEnabled`.

- [ ] **Step 1: Ajouter les clés i18n**

Dans la section `settings` de `src/i18n/locales/fr.ts` :
```ts
		widget: "Widget de bureau",
```
Et un bloc frère `widget` (hors `settings`) pour la vue :
```ts
	widget: {
		viewToday: "Aujourd'hui",
		viewAll: "Toutes",
	},
```
Équivalents dans `en.ts` :
```ts
		widget: "Desktop widget",
```
```ts
	widget: {
		viewToday: "Today",
		viewAll: "All",
	},
```

- [ ] **Step 2: Ajouter l'interrupteur**

Dans `src/components/layout/SettingsDialog.tsx`, sélectionner l'état (près des autres) :
```ts
	const widgetEnabled = useSettingsStore((s) => s.widgetEnabled);
	const setWidgetEnabled = useSettingsStore((s) => s.setWidgetEnabled);
```
Et ajouter le bloc dans la section Apparence (après le `Switch` colorblindMode, l.480) :
```tsx
	<div className="flex items-center justify-between cursor-pointer select-none">
		<span className="text-sm text-foreground">{t("settings.widget")}</span>
		<Switch
			checked={widgetEnabled}
			onCheckedChange={(v) => setWidgetEnabled(getRepository(), v)}
		/>
	</div>
```

- [ ] **Step 3: Vérifier build + tests**

Run: `pnpm test:run && pnpm build`
Expected: OK.

- [ ] **Step 4: Vérification manuelle de bout en bout**

`pnpm tauri dev` : activer *Widget de bureau* dans les paramètres → la vignette apparaît sur le bureau ; changer de vue (Aujourd'hui/Toutes/projet) ; cocher une tâche dans le widget → la fenêtre principale se met à jour, et inversement ; fermer la fenêtre principale → pas d'icône Dock, widget toujours là ; désactiver le réglage → widget disparaît.

- [ ] **Step 5: Checkpoint** (`feat: settings toggle for desktop widget`).

---

## Task 13: Fin de tâche projet (changelog + react-doctor + lint)

Obligatoire selon `CLAUDE.md` — le widget est une fonctionnalité visible par l'utilisateur.

**Files:**
- Modify: `src/assets/changelog.json`

- [ ] **Step 1: Entrée changelog (section `Unreleased`, `features`, bilingue)**

Ajouter dans `src/assets/changelog.json` (section `version: "Unreleased"`, tableau `features`) :
```json
{
	"en": "New macOS desktop widget: pin your task list to the desktop with a menu bar icon (enable it in Settings).",
	"fr": "Nouveau widget de bureau macOS : épinglez votre liste de tâches sur le bureau, avec une icône de barre de menu (à activer dans les Paramètres)."
}
```
> Respecter la structure exacte des entrées existantes (vérifier la forme d'un item de `features` dans le fichier).

- [ ] **Step 2: react-doctor**

Prérequis env (sinon crash du binding natif) : `nvm use 22.22.2` puis `rm -rf ~/.npm/_npx`. Puis lancer le skill `react-doctor` et ne corriger **que** les diagnostics introduits par ce travail.

- [ ] **Step 3: Lint**

Run: `pnpm run lint:fix`
Expected: formatage/indentation corrigés (Biome), aucune erreur résiduelle.

- [ ] **Step 4: Suite complète**

Run: `pnpm test:run && pnpm build`
Expected: vert.

- [ ] **Step 5: Checkpoint final** (l'utilisateur committe l'ensemble).

---

## Notes de vérification (récapitulatif manuel macOS)

Le comportement natif ne se teste pas en Vitest ; vérifier à la main sur macOS :
- Widget visible seulement bureau dégagé, caché par les apps ouvertes.
- Présent sur tous les Spaces, ignoré par Mission Control.
- Cliquer une tâche ne vole pas le focus de l'app active.
- Pas d'icône Dock hors utilisation de la fenêtre principale ; Dock dynamique.
- Lancement au login sans ouvrir la fenêtre principale (widget seul si activé).
- Réactivité bidirectionnelle widget ↔ fenêtre principale.
