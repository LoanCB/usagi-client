import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import { DEFAULT_SHORTCUTS, type SortShortcut } from "@/lib/shortcuts";
import { useShortcutsStore } from "./shortcuts";

function makeRepo(settings: Record<string, string> = {}): TodoRepository {
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
		getTags: vi.fn(),
		createTag: vi.fn(),
		updateTag: vi.fn(),
		deleteTag: vi.fn(),
		getSettings: vi.fn().mockResolvedValue(settings),
		setSetting: vi.fn().mockResolvedValue(undefined),
	} as unknown as TodoRepository;
}

beforeEach(() => {
	useShortcutsStore.setState({ ...DEFAULT_SHORTCUTS });
});

describe("loadShortcuts", () => {
	it("keeps defaults when no sort_shortcuts key in DB", async () => {
		const repo = makeRepo({});
		const { result } = renderHook(() => useShortcutsStore());
		await act(() => result.current.loadShortcuts(repo));
		expect(result.current.sortUrgency).toEqual(DEFAULT_SHORTCUTS.sortUrgency);
	});

	it("loads stored shortcuts from DB", async () => {
		const custom: SortShortcut = {
			key: "u",
			meta: false,
			ctrl: false,
			alt: true,
			shift: false,
		};
		const repo = makeRepo({
			sort_shortcuts: JSON.stringify({ urgency: custom }),
		});
		const { result } = renderHook(() => useShortcutsStore());
		await act(() => result.current.loadShortcuts(repo));
		expect(result.current.sortUrgency).toEqual(custom);
		expect(result.current.sortDueDate).toEqual(DEFAULT_SHORTCUTS.sortDueDate);
	});

	it("keeps defaults on malformed JSON", async () => {
		const repo = makeRepo({ sort_shortcuts: "not-json" });
		const { result } = renderHook(() => useShortcutsStore());
		await act(() => result.current.loadShortcuts(repo));
		expect(result.current.sortUrgency).toEqual(DEFAULT_SHORTCUTS.sortUrgency);
	});
});

describe("setShortcut", () => {
	it("updates state and calls setSetting", async () => {
		const repo = makeRepo();
		const { result } = renderHook(() => useShortcutsStore());
		const newShortcut: SortShortcut = {
			key: null,
			meta: false,
			ctrl: false,
			alt: false,
			shift: false,
		};
		await act(() =>
			result.current.setShortcut(repo, "sortUrgency", newShortcut),
		);
		expect(result.current.sortUrgency).toEqual(newShortcut);
		expect(repo.setSetting).toHaveBeenCalledWith(
			"sort_shortcuts",
			expect.stringContaining('"urgency":{"key":null'),
		);
	});
});

describe("resetShortcuts", () => {
	it("restores all shortcuts to defaults and calls setSetting", async () => {
		const repo = makeRepo();
		const { result } = renderHook(() => useShortcutsStore());

		const custom: SortShortcut = {
			key: "x",
			meta: false,
			ctrl: true,
			alt: false,
			shift: false,
		};
		await act(() => result.current.setShortcut(repo, "sortUrgency", custom));
		expect(result.current.sortUrgency).toEqual(custom);

		await act(() => result.current.resetShortcuts(repo));

		expect(result.current.sortUrgency).toEqual(DEFAULT_SHORTCUTS.sortUrgency);
		expect(result.current.sortDueDate).toEqual(DEFAULT_SHORTCUTS.sortDueDate);
		expect(result.current.sortProject).toEqual(DEFAULT_SHORTCUTS.sortProject);
		expect(repo.setSetting).toHaveBeenLastCalledWith(
			"sort_shortcuts",
			JSON.stringify({
				urgency: DEFAULT_SHORTCUTS.sortUrgency,
				dueDate: DEFAULT_SHORTCUTS.sortDueDate,
				project: DEFAULT_SHORTCUTS.sortProject,
			}),
		);
	});
});
