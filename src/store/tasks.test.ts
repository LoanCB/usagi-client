import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTaskStore } from "./tasks";
import type { TodoRepository } from "@/db/repository";
import type { Task } from "@/types";

const baseTask: Task = {
  id: "t1", title: "Test task", description: null, projectId: null, priority: "none",
  dueDate: null, completedAt: null, tags: [], sortOrder: 0,
  createdAt: "2026-04-10T10:00:00.000Z", updatedAt: "2026-04-10T10:00:00.000Z",
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
  return {
    getTasks: vi.fn().mockResolvedValue([baseTask]),
    getTask: vi.fn().mockResolvedValue(baseTask),
    createTask: vi.fn().mockResolvedValue(baseTask),
    updateTask: vi.fn().mockResolvedValue(baseTask),
    completeTask: vi.fn().mockResolvedValue({ ...baseTask, completedAt: "2026-04-10T11:00:00.000Z" }),
    uncompleteTask: vi.fn().mockResolvedValue(baseTask),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    getProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    getTags: vi.fn().mockResolvedValue([]),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    reorderTasks: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useTaskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], loading: false });
  });

  it("loadTasks populates tasks from repository", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.loadTasks(repo); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("Test task");
  });

  it("createTask appends new task to state", async () => {
    const newTask: Task = { ...baseTask, id: "t2", title: "New task" };
    const repo = makeRepo({ createTask: vi.fn().mockResolvedValue(newTask) });
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.createTask(repo, { title: "New task" }); });
    expect(result.current.tasks.some((t) => t.id === "t2")).toBe(true);
  });

  it("deleteTask removes task from state", async () => {
    useTaskStore.setState({ tasks: [baseTask], loading: false });
    const repo = makeRepo({ deleteTask: vi.fn().mockResolvedValue(undefined) });
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.deleteTask(repo, "t1"); });
    expect(result.current.tasks).toHaveLength(0);
  });

  it("completeTask updates task in state", async () => {
    useTaskStore.setState({ tasks: [baseTask], loading: false });
    const completed = { ...baseTask, completedAt: "2026-04-10T11:00:00.000Z" };
    const repo = makeRepo({ completeTask: vi.fn().mockResolvedValue(completed) });
    const { result } = renderHook(() => useTaskStore());
    await act(async () => { await result.current.completeTask(repo, "t1"); });
    expect(result.current.tasks[0].completedAt).not.toBeNull();
  });
});
