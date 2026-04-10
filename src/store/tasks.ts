import { create } from "zustand";
import type { Task, CreateTaskInput, TaskFilters } from "@/types";
import type { TodoRepository } from "@/db/repository";

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  loadTasks(repo: TodoRepository, filters?: TaskFilters): Promise<void>;
  createTask(repo: TodoRepository, input: CreateTaskInput): Promise<Task>;
  updateTask(repo: TodoRepository, id: string, patch: Partial<CreateTaskInput>): Promise<void>;
  completeTask(repo: TodoRepository, id: string): Promise<void>;
  uncompleteTask(repo: TodoRepository, id: string): Promise<void>;
  deleteTask(repo: TodoRepository, id: string): Promise<void>;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  loading: false,

  async loadTasks(repo, filters) {
    set({ loading: true });
    const tasks = await repo.getTasks(filters);
    set({ tasks, loading: false });
  },

  async createTask(repo, input) {
    const task = await repo.createTask(input);
    set((s) => ({ tasks: [task, ...s.tasks] }));
    return task;
  },

  async updateTask(repo, id, patch) {
    const updated = await repo.updateTask(id, patch);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  async completeTask(repo, id) {
    const updated = await repo.completeTask(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  async uncompleteTask(repo, id) {
    const updated = await repo.uncompleteTask(id);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  async deleteTask(repo, id) {
    await repo.deleteTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
}));
