import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import type { Task } from "@/types";
import { useTaskStore } from "./tasks";

const baseTask: Task = {
	id: "t1",
	title: "Test task",
	description: null,
	projectId: null,
	priority: "none",
	dueDate: null,
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: "2026-04-10T10:00:00.000Z",
	updatedAt: "2026-04-10T10:00:00.000Z",
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
	return {
		getTasks: vi.fn().mockResolvedValue([baseTask]),
		getTask: vi.fn().mockResolvedValue(baseTask),
		createTask: vi.fn().mockResolvedValue(baseTask),
		updateTask: vi.fn().mockResolvedValue(baseTask),
		completeTask: vi.fn().mockResolvedValue({
			...baseTask,
			completedAt: "2026-04-10T11:00:00.000Z",
		}),
		uncompleteTask: vi.fn().mockResolvedValue(baseTask),
		archiveTask: vi.fn().mockResolvedValue(undefined),
		deleteTask: vi.fn().mockResolvedValue(undefined),
		unarchiveTask: vi.fn().mockResolvedValue(undefined),
		getArchivedTasks: vi.fn().mockResolvedValue([]),
		getProjects: vi.fn().mockResolvedValue([]),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
		getTags: vi.fn().mockResolvedValue([]),
		createTag: vi.fn(),
		updateTag: vi.fn(),
		deleteTag: vi.fn(),
		isTagUsedInProjectTasks: vi.fn().mockResolvedValue(false),
		reorderTasks: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
		setSetting: vi.fn().mockResolvedValue(undefined),
		bulkImport: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

describe("useTaskStore", () => {
	beforeEach(() => {
		useTaskStore.setState({ tasks: [], archivedTasks: [], loading: false });
	});

	it("loadTasks populates tasks from repository", async () => {
		const repo = makeRepo();
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.loadTasks(repo);
		});
		expect(result.current.tasks).toHaveLength(1);
		expect(result.current.tasks[0].title).toBe("Test task");
	});

	it("createTask appends new task to state", async () => {
		const newTask: Task = { ...baseTask, id: "t2", title: "New task" };
		const repo = makeRepo({ createTask: vi.fn().mockResolvedValue(newTask) });
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.createTask(repo, { title: "New task" });
		});
		expect(result.current.tasks.some((t) => t.id === "t2")).toBe(true);
	});

	it("deleteTask hard-deletes task from tasks state", async () => {
		useTaskStore.setState({
			tasks: [baseTask],
			archivedTasks: [],
			loading: false,
		});
		const repo = makeRepo({ deleteTask: vi.fn().mockResolvedValue(undefined) });
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.deleteTask(repo, "t1");
		});
		expect(result.current.tasks).toHaveLength(0);
	});

	it("completeTask updates task in state", async () => {
		useTaskStore.setState({ tasks: [baseTask], loading: false });
		const completed = { ...baseTask, completedAt: "2026-04-10T11:00:00.000Z" };
		const repo = makeRepo({
			completeTask: vi.fn().mockResolvedValue(completed),
		});
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.completeTask(repo, "t1");
		});
		expect(result.current.tasks[0].completedAt).not.toBeNull();
	});

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
		const repo = makeRepo({
			uncompleteTask: vi.fn().mockResolvedValue(baseTask),
		});
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.uncompleteTask(repo, "t1");
		});
		expect(result.current.tasks[0].completedAt).toBeNull();
	});

	it("archiveTask removes task from tasks array", async () => {
		useTaskStore.setState({
			tasks: [baseTask],
			archivedTasks: [],
			loading: false,
		});
		const repo = makeRepo({
			archiveTask: vi.fn().mockResolvedValue(undefined),
		});
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.archiveTask(repo, "t1");
		});
		expect(result.current.tasks).toHaveLength(0);
	});

	it("loadArchivedTasks populates archivedTasks from repository", async () => {
		const archivedTask: Task = {
			...baseTask,
			id: "t2",
			deletedAt: "2026-05-01T10:00:00.000Z",
		};
		const repo = makeRepo({
			getArchivedTasks: vi.fn().mockResolvedValue([archivedTask]),
		});
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.loadArchivedTasks(repo);
		});
		expect(result.current.archivedTasks).toHaveLength(1);
		expect(result.current.archivedTasks[0].id).toBe("t2");
	});

	it("unarchiveTask removes task from archivedTasks", async () => {
		const archivedTask: Task = {
			...baseTask,
			id: "t2",
			deletedAt: "2026-05-01T10:00:00.000Z",
		};
		useTaskStore.setState({
			tasks: [],
			archivedTasks: [archivedTask],
			loading: false,
		});
		const repo = makeRepo({
			unarchiveTask: vi.fn().mockResolvedValue(undefined),
		});
		const { result } = renderHook(() => useTaskStore());
		await act(async () => {
			await result.current.unarchiveTask(repo, "t2");
		});
		expect(result.current.archivedTasks).toHaveLength(0);
	});

	it("reorderTasks applies optimistic in-memory reorder immediately", async () => {
		const t1: Task = { ...baseTask, id: "t1", sortOrder: 0 };
		const t2: Task = { ...baseTask, id: "t2", sortOrder: 1 };
		useTaskStore.setState({ tasks: [t1, t2], loading: false });
		const repo = makeRepo({
			reorderTasks: vi.fn().mockResolvedValue(undefined),
		});
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
});
