# Unit Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unit tests for all untested pure functions and stores, and complete coverage for partially-tested stores.

**Architecture:** Co-locate new test files next to their source. Store tests use a `makeRepo()` factory with `vi.fn()` mocks and `store.setState()` for reset in `beforeEach`. Pure function tests use no mocks except `vi.stubGlobal` on `navigator` for platform detection.

**Tech Stack:** Vitest 4, @testing-library/react 16, happy-dom, Zustand 5

---

## Task 1: `src/lib/utils.test.ts`

**Files:**
- Create: `src/lib/utils.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	formatDate,
	hasModifier,
	isOverdue,
	isMac,
	modifierLabel,
	todayIso,
} from "./utils";

describe("formatDate", () => {
	it("formats an ISO date to a short locale string", () => {
		expect(formatDate("2026-04-12")).toMatch(/Apr\s*12/);
	});

	it("respects an optional locale param", () => {
		const result = formatDate("2026-04-12", "fr-FR");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("isOverdue", () => {
	it("returns true for a past date", () => {
		expect(isOverdue("2000-01-01")).toBe(true);
	});

	it("returns false for today", () => {
		const now = new Date();
		const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		expect(isOverdue(iso)).toBe(false);
	});

	it("returns false for a future date", () => {
		expect(isOverdue("2099-12-31")).toBe(false);
	});
});

describe("todayIso", () => {
	it("returns a string matching YYYY-MM-DD", () => {
		expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("matches the current local date", () => {
		const now = new Date();
		const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		expect(todayIso()).toBe(expected);
	});
});

describe("isMac", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns true when userAgentData.platform is macOS", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "Mozilla/5.0",
		});
		expect(isMac()).toBe(true);
	});

	it("returns false when userAgentData.platform is Win32", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "Mozilla/5.0",
		});
		expect(isMac()).toBe(false);
	});

	it("falls back to userAgent when userAgentData is absent", () => {
		vi.stubGlobal("navigator", {
			userAgentData: undefined,
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
		});
		expect(isMac()).toBe(true);
	});
});

describe("modifierLabel", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns ⌘ on Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "",
		});
		expect(modifierLabel()).toBe("⌘");
	});

	it("returns 'Ctrl+' on non-Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "",
		});
		expect(modifierLabel()).toBe("Ctrl+");
	});
});

describe("hasModifier", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns true when metaKey is pressed on Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: true, ctrlKey: false } as KeyboardEvent)).toBe(true);
	});

	it("returns false when ctrlKey is pressed on Mac (wrong modifier)", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: false, ctrlKey: true } as KeyboardEvent)).toBe(false);
	});

	it("returns true when ctrlKey is pressed on non-Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: false, ctrlKey: true } as KeyboardEvent)).toBe(true);
	});

	it("returns false when metaKey is pressed on non-Mac (wrong modifier)", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: true, ctrlKey: false } as KeyboardEvent)).toBe(false);
	});
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `pnpm test:run src/lib/utils.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.test.ts
git commit -m "test: add unit tests for lib/utils pure functions"
```

---

## Task 2: `src/store/ui.test.ts`

**Files:**
- Create: `src/store/ui.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "./ui";

beforeEach(() => {
	useUIStore.setState({
		sidebarCollapsed: false,
		selectedProjectId: undefined,
		selectedTaskId: null,
		activeFilters: {},
	});
});

describe("setSidebarCollapsed", () => {
	it("updates sidebarCollapsed to true", () => {
		useUIStore.getState().setSidebarCollapsed(true);
		expect(useUIStore.getState().sidebarCollapsed).toBe(true);
	});

	it("updates sidebarCollapsed to false", () => {
		useUIStore.setState({ sidebarCollapsed: true });
		useUIStore.getState().setSidebarCollapsed(false);
		expect(useUIStore.getState().sidebarCollapsed).toBe(false);
	});
});

describe("setSelectedProject", () => {
	it("updates selectedProjectId", () => {
		useUIStore.getState().setSelectedProject("proj-1");
		expect(useUIStore.getState().selectedProjectId).toBe("proj-1");
	});

	it("resets selectedTaskId to null", () => {
		useUIStore.setState({ selectedTaskId: "task-1" });
		useUIStore.getState().setSelectedProject("proj-1");
		expect(useUIStore.getState().selectedTaskId).toBeNull();
	});

	it("resets activeFilters to empty object", () => {
		useUIStore.setState({ activeFilters: { priority: "high" } });
		useUIStore.getState().setSelectedProject("proj-1");
		expect(useUIStore.getState().activeFilters).toEqual({});
	});

	it("accepts null for Inbox view", () => {
		useUIStore.getState().setSelectedProject(null);
		expect(useUIStore.getState().selectedProjectId).toBeNull();
	});

	it("accepts undefined for all-tasks view", () => {
		useUIStore.getState().setSelectedProject(undefined);
		expect(useUIStore.getState().selectedProjectId).toBeUndefined();
	});
});

describe("setSelectedTask", () => {
	it("updates selectedTaskId", () => {
		useUIStore.getState().setSelectedTask("task-42");
		expect(useUIStore.getState().selectedTaskId).toBe("task-42");
	});

	it("clears selectedTaskId when set to null", () => {
		useUIStore.setState({ selectedTaskId: "task-1" });
		useUIStore.getState().setSelectedTask(null);
		expect(useUIStore.getState().selectedTaskId).toBeNull();
	});
});

describe("setFilters", () => {
	it("merges partial filters over existing activeFilters", () => {
		useUIStore.setState({ activeFilters: { priority: "high" } });
		useUIStore.getState().setFilters({ completed: true });
		expect(useUIStore.getState().activeFilters).toEqual({
			priority: "high",
			completed: true,
		});
	});

	it("overwrites an existing key", () => {
		useUIStore.setState({ activeFilters: { priority: "high" } });
		useUIStore.getState().setFilters({ priority: "low" });
		expect(useUIStore.getState().activeFilters.priority).toBe("low");
	});
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `pnpm test:run src/store/ui.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/ui.test.ts
git commit -m "test: add unit tests for useUIStore"
```

---

## Task 3: `src/store/projects.test.ts`

**Files:**
- Create: `src/store/projects.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import type { Project } from "@/types";
import { useProjectStore } from "./projects";

const baseProject: Project = {
	id: "p1",
	name: "Inbox",
	color: "#3b82f6",
	icon: null,
	sortOrder: 0,
	createdAt: "2026-04-01T00:00:00.000Z",
	updatedAt: "2026-04-01T00:00:00.000Z",
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
	return {
		getTasks: vi.fn(),
		getTask: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		completeTask: vi.fn(),
		uncompleteTask: vi.fn(),
		deleteTask: vi.fn(),
		reorderTasks: vi.fn(),
		getProjects: vi.fn().mockResolvedValue([baseProject]),
		createProject: vi.fn().mockResolvedValue(baseProject),
		updateProject: vi.fn().mockResolvedValue(baseProject),
		deleteProject: vi.fn().mockResolvedValue(undefined),
		getTags: vi.fn(),
		createTag: vi.fn(),
		updateTag: vi.fn(),
		deleteTag: vi.fn(),
		getSettings: vi.fn().mockResolvedValue({}),
		setSetting: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as TodoRepository;
}

describe("useProjectStore", () => {
	beforeEach(() => {
		useProjectStore.setState({ projects: [] });
	});

	it("loadProjects populates projects from repository", async () => {
		const repo = makeRepo();
		await useProjectStore.getState().loadProjects(repo);
		expect(useProjectStore.getState().projects).toHaveLength(1);
		expect(useProjectStore.getState().projects[0].name).toBe("Inbox");
	});

	it("createProject appends new project to end of list", async () => {
		const newProject: Project = { ...baseProject, id: "p2", name: "Work" };
		const repo = makeRepo({
			createProject: vi.fn().mockResolvedValue(newProject),
		});
		await useProjectStore.getState().createProject(repo, { name: "Work" });
		expect(useProjectStore.getState().projects.some((p) => p.id === "p2")).toBe(true);
	});

	it("updateProject replaces the correct project in-place", async () => {
		const updated: Project = { ...baseProject, name: "Updated" };
		useProjectStore.setState({ projects: [baseProject] });
		const repo = makeRepo({
			updateProject: vi.fn().mockResolvedValue(updated),
		});
		await useProjectStore.getState().updateProject(repo, "p1", { name: "Updated" });
		expect(useProjectStore.getState().projects[0].name).toBe("Updated");
	});

	it("deleteProject removes project from list", async () => {
		useProjectStore.setState({ projects: [baseProject] });
		const repo = makeRepo({
			deleteProject: vi.fn().mockResolvedValue(undefined),
		});
		await useProjectStore.getState().deleteProject(repo, "p1");
		expect(useProjectStore.getState().projects).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `pnpm test:run src/store/projects.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/projects.test.ts
git commit -m "test: add unit tests for useProjectStore"
```

---

## Task 4: `src/store/tags.test.ts`

**Files:**
- Create: `src/store/tags.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import type { Tag } from "@/types";
import { useTagStore } from "./tags";

const baseTag: Tag = {
	id: "tag-1",
	name: "urgent",
	color: "#ef4444",
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
	return {
		getTasks: vi.fn(),
		getTask: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		completeTask: vi.fn(),
		uncompleteTask: vi.fn(),
		deleteTask: vi.fn(),
		reorderTasks: vi.fn(),
		getProjects: vi.fn(),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
		getTags: vi.fn().mockResolvedValue([baseTag]),
		createTag: vi.fn().mockResolvedValue(baseTag),
		updateTag: vi.fn().mockResolvedValue(baseTag),
		deleteTag: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
		setSetting: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as TodoRepository;
}

describe("useTagStore", () => {
	beforeEach(() => {
		useTagStore.setState({ tags: [] });
	});

	it("loadTags populates tags from repository", async () => {
		const repo = makeRepo();
		await useTagStore.getState().loadTags(repo);
		expect(useTagStore.getState().tags).toHaveLength(1);
		expect(useTagStore.getState().tags[0].name).toBe("urgent");
	});

	it("createTag appends new tag to list", async () => {
		const newTag: Tag = { id: "tag-2", name: "work", color: "#3b82f6" };
		const repo = makeRepo({
			createTag: vi.fn().mockResolvedValue(newTag),
		});
		await useTagStore.getState().createTag(repo, { name: "work" });
		expect(useTagStore.getState().tags.some((t) => t.id === "tag-2")).toBe(true);
	});

	it("updateTag replaces the correct tag in-place", async () => {
		const updated: Tag = { ...baseTag, name: "critical" };
		useTagStore.setState({ tags: [baseTag] });
		const repo = makeRepo({
			updateTag: vi.fn().mockResolvedValue(updated),
		});
		await useTagStore.getState().updateTag(repo, "tag-1", { name: "critical" });
		expect(useTagStore.getState().tags[0].name).toBe("critical");
	});

	it("deleteTag removes tag from list", async () => {
		useTagStore.setState({ tags: [baseTag] });
		const repo = makeRepo({
			deleteTag: vi.fn().mockResolvedValue(undefined),
		});
		await useTagStore.getState().deleteTag(repo, "tag-1");
		expect(useTagStore.getState().tags).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `pnpm test:run src/store/tags.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/tags.test.ts
git commit -m "test: add unit tests for useTagStore"
```

---

## Task 5: Extend `src/store/tasks.test.ts`

**Files:**
- Modify: `src/store/tasks.test.ts`

The file has an existing `describe("useTaskStore", ...)` block. Append these four tests inside it, before the closing `});`.

- [ ] **Step 1: Add the four missing tests inside `describe("useTaskStore", ...)`**

Append before the closing `});` of the describe block:

```ts
	it("updateTask replaces the updated task in state", async () => {
		useTaskStore.setState({ tasks: [baseTask], loading: false });
		const updated: Task = { ...baseTask, title: "Updated title" };
		const repo = makeRepo({ updateTask: vi.fn().mockResolvedValue(updated) });
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.updateTask(repo, "t1", { title: "Updated title" });
		});
		expect(result.current.tasks[0].title).toBe("Updated title");
	});

	it("uncompleteTask sets completedAt back to null", async () => {
		const completed: Task = {
			...baseTask,
			completedAt: "2026-04-10T11:00:00.000Z",
		};
		useTaskStore.setState({ tasks: [completed], loading: false });
		const repo = makeRepo({ uncompleteTask: vi.fn().mockResolvedValue(baseTask) });
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.uncompleteTask(repo, "t1");
		});
		expect(result.current.tasks[0].completedAt).toBeNull();
	});

	it("reorderTasks applies optimistic in-memory reorder immediately", async () => {
		const t1: Task = { ...baseTask, id: "t1", sortOrder: 0 };
		const t2: Task = { ...baseTask, id: "t2", sortOrder: 1 };
		useTaskStore.setState({ tasks: [t1, t2], loading: false });
		const repo = makeRepo({ reorderTasks: vi.fn().mockResolvedValue(undefined) });
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.reorderTasks(repo, ["t2", "t1"]);
		});
		expect(result.current.tasks[0].id).toBe("t2");
		expect(result.current.tasks[0].sortOrder).toBe(0);
		expect(result.current.tasks[1].id).toBe("t1");
		expect(result.current.tasks[1].sortOrder).toBe(1);
	});

	it("reorderTasks rolls back to previous state when repo throws", async () => {
		const t1: Task = { ...baseTask, id: "t1", sortOrder: 0 };
		const t2: Task = { ...baseTask, id: "t2", sortOrder: 1 };
		useTaskStore.setState({ tasks: [t1, t2], loading: false });
		const repo = makeRepo({
			reorderTasks: vi.fn().mockRejectedValue(new Error("DB error")),
		});
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await expect(
				result.current.reorderTasks(repo, ["t2", "t1"]),
			).rejects.toThrow("DB error");
		});
		expect(result.current.tasks[0].id).toBe("t1");
		expect(result.current.tasks[1].id).toBe("t2");
	});
```

Also add `type { Task }` to the existing type import if not already present. The existing import line is:
```ts
import type { Task } from "@/types";
```
It already imports `Task`, so no change needed.

- [ ] **Step 2: Run and verify all pass**

Run: `pnpm test:run src/store/tasks.test.ts`
Expected: all tests PASS (8 total)

- [ ] **Step 3: Commit**

```bash
git add src/store/tasks.test.ts
git commit -m "test: complete coverage for useTaskStore (updateTask, uncompleteTask, reorderTasks)"
```

---

## Task 6: Extend `src/store/settings.test.ts`

**Files:**
- Modify: `src/store/settings.test.ts`

The existing file has a top-level `mockRepo`, a top-level `beforeEach`, and a `describe("useSettingsStore glassmorphism", ...)` block. Add a new describe block after it.

The existing top-level `beforeEach` only resets `glassmorphismEnabled`. The new describe block needs its own `beforeEach` to also reset the new fields.

- [ ] **Step 1: Append a new describe block at the end of the file**

```ts
describe("useSettingsStore notifications and parallax", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSettingsStore.setState({
			notificationsEnabled: true,
			notificationTimes: [
				{ hour: 10, minute: 0 },
				{ hour: 14, minute: 0 },
			],
			parallaxEnabled: true,
			glassmorphismEnabled: false,
		});
	});

	it("loadSettings sets notificationsEnabled to false when stored as 'false'", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({ notification_enabled: "false" });
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
	});

	it("loadSettings defaults notificationsEnabled to true when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
	});

	it("loadSettings restores notificationTimes from JSON", async () => {
		const times = [{ hour: 9, minute: 30 }];
		mockRepo.getSettings.mockResolvedValueOnce({
			notification_times: JSON.stringify(times),
		});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationTimes).toEqual(times);
	});

	it("loadSettings uses default notificationTimes when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationTimes).toEqual([
			{ hour: 10, minute: 0 },
			{ hour: 14, minute: 0 },
		]);
	});

	it("loadSettings sets parallaxEnabled to false when stored as 'false'", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({ parallax_enabled: "false" });
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().parallaxEnabled).toBe(false);
	});

	it("loadSettings defaults parallaxEnabled to true when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().parallaxEnabled).toBe(true);
	});

	it("setNotificationsEnabled updates state and calls setSetting", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().setNotificationsEnabled(mockRepo as any, false);
		expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"notification_enabled",
			"false",
		);
	});

	it("setNotificationTimes updates state and serialises times to JSON", async () => {
		const times = [{ hour: 8, minute: 0, enabled: true }];
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().setNotificationTimes(mockRepo as any, times);
		expect(useSettingsStore.getState().notificationTimes).toEqual(times);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"notification_times",
			JSON.stringify(times),
		);
	});

	it("setParallaxEnabled updates state and calls setSetting", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().setParallaxEnabled(mockRepo as any, false);
		expect(useSettingsStore.getState().parallaxEnabled).toBe(false);
		expect(mockRepo.setSetting).toHaveBeenCalledWith("parallax_enabled", "false");
	});
});
```

- [ ] **Step 2: Run and verify all pass**

Run: `pnpm test:run src/store/settings.test.ts`
Expected: all tests PASS (12 total: 3 existing + 9 new)

- [ ] **Step 3: Commit**

```bash
git add src/store/settings.test.ts
git commit -m "test: complete coverage for useSettingsStore (notifications, parallax, loadSettings)"
```

---

## Final verification

- [ ] **Run full test suite**

Run: `pnpm test:run`
Expected: all tests PASS, no regressions
