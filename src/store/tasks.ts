import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import type { CreateTaskInput, Task, TaskFilters } from "@/types";

interface TaskStore {
	tasks: Task[];
	loading: boolean;
	loadTasks(repo: TodoRepository, filters?: TaskFilters): Promise<void>;
	createTask(repo: TodoRepository, input: CreateTaskInput): Promise<Task>;
	updateTask(
		repo: TodoRepository,
		id: string,
		patch: Partial<CreateTaskInput>,
	): Promise<void>;
	completeTask(repo: TodoRepository, id: string): Promise<void>;
	uncompleteTask(repo: TodoRepository, id: string): Promise<void>;
	deleteTask(repo: TodoRepository, id: string): Promise<void>;
	reorderTasks(repo: TodoRepository, orderedIds: string[]): Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
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

	async reorderTasks(repo, orderedIds) {
		const prev = get().tasks;
		// Optimistic update: reorder in-memory immediately
		set((s) => {
			const byId = new Map(s.tasks.map((t) => [t.id, t]));
			const reordered = orderedIds
				.map((id, i) => {
					const t = byId.get(id);
					return t ? { ...t, sortOrder: i } : null;
				})
				.filter(Boolean) as Task[];
			const rest = s.tasks.filter((t) => !orderedIds.includes(t.id));
			return { tasks: [...reordered, ...rest] };
		});
		try {
			await repo.reorderTasks(orderedIds);
		} catch (e) {
			set({ tasks: prev }); // rollback on DB failure
			throw e;
		}
	},
}));
