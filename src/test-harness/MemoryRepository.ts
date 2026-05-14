import type { TodoRepository } from "@/db/repository";
import type {
	CreateProjectInput,
	CreateTagInput,
	CreateTaskInput,
	Priority,
	Project,
	Tag,
	Task,
	TaskFilters,
} from "@/types";

function now(): string {
	return new Date().toISOString();
}

function uuid(): string {
	return crypto.randomUUID();
}

export class MemoryRepository implements TodoRepository {
	private tasks = new Map<string, Task>();
	private projects = new Map<string, Project>();
	private tags = new Map<string, Tag>();
	private settings = new Map<string, string>([
		["notification_enabled", "false"],
	]);
	private sortCounter = 0;

	async getTasks(filters: TaskFilters = {}): Promise<Task[]> {
		let results = Array.from(this.tasks.values());

		if (filters.completed !== true) {
			results = results.filter((t) => t.completedAt === null);
		}

		if (filters.projectId !== undefined) {
			results = results.filter((t) => t.projectId === filters.projectId);
		}

		if (filters.priority) {
			results = results.filter((t) => t.priority === filters.priority);
		}

		if (filters.tagIds && filters.tagIds.length > 0) {
			results = results.filter((t) =>
				filters.tagIds?.some((id) => t.tags.some((tag) => tag.id === id)),
			);
		}

		if (filters.dueBefore) {
			results = results.filter(
				(t) => t.dueDate !== null && t.dueDate <= filters.dueBefore,
			);
		}

		return results.sort((a, b) => a.sortOrder - b.sortOrder);
	}

	async getTask(id: string): Promise<Task | null> {
		return this.tasks.get(id) ?? null;
	}

	async createTask(input: CreateTaskInput): Promise<Task> {
		const tagObjects: Tag[] = (input.tagIds ?? [])
			.map((id) => this.tags.get(id))
			.filter((t): t is Tag => t !== undefined);

		const task: Task = {
			id: uuid(),
			title: input.title,
			description: input.description ?? null,
			projectId: input.projectId ?? null,
			priority: (input.priority as Priority) ?? "none",
			dueDate: input.dueDate ?? null,
			completedAt: null,
			tags: tagObjects,
			sortOrder: ++this.sortCounter,
			createdAt: now(),
			updatedAt: now(),
		};
		this.tasks.set(task.id, task);
		return task;
	}

	async updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task> {
		const task = this.tasks.get(id);
		if (!task) throw new Error(`Task ${id} not found`);

		const tagObjects: Tag[] =
			patch.tagIds !== undefined
				? (patch.tagIds ?? [])
						.map((tid) => this.tags.get(tid))
						.filter((t): t is Tag => t !== undefined)
				: task.tags;

		const updated: Task = {
			...task,
			...(patch.title !== undefined && { title: patch.title }),
			...(patch.description !== undefined && {
				description: patch.description ?? null,
			}),
			...(patch.projectId !== undefined && {
				projectId: patch.projectId ?? null,
			}),
			...(patch.priority !== undefined && {
				priority: patch.priority as Priority,
			}),
			...(patch.dueDate !== undefined && { dueDate: patch.dueDate ?? null }),
			tags: tagObjects,
			updatedAt: now(),
		};
		this.tasks.set(id, updated);
		return updated;
	}

	async completeTask(id: string): Promise<Task> {
		const task = this.tasks.get(id);
		if (!task) throw new Error(`Task ${id} not found`);
		const updated = { ...task, completedAt: now(), updatedAt: now() };
		this.tasks.set(id, updated);
		return updated;
	}

	async uncompleteTask(id: string): Promise<Task> {
		const task = this.tasks.get(id);
		if (!task) throw new Error(`Task ${id} not found`);
		const updated = { ...task, completedAt: null, updatedAt: now() };
		this.tasks.set(id, updated);
		return updated;
	}

	async deleteTask(id: string): Promise<void> {
		this.tasks.delete(id);
	}

	async reorderTasks(orderedIds: string[]): Promise<void> {
		orderedIds.forEach((id, index) => {
			const task = this.tasks.get(id);
			if (task) this.tasks.set(id, { ...task, sortOrder: index });
		});
	}

	async getProjects(): Promise<Project[]> {
		return Array.from(this.projects.values()).sort(
			(a, b) => a.sortOrder - b.sortOrder,
		);
	}

	async createProject(input: CreateProjectInput): Promise<Project> {
		const project: Project = {
			id: uuid(),
			name: input.name,
			color: input.color ?? null,
			icon: input.icon ?? null,
			sortOrder: ++this.sortCounter,
			createdAt: now(),
			updatedAt: now(),
		};
		this.projects.set(project.id, project);
		return project;
	}

	async updateProject(
		id: string,
		patch: Partial<CreateProjectInput>,
	): Promise<Project> {
		const project = this.projects.get(id);
		if (!project) throw new Error(`Project ${id} not found`);
		const updated: Project = { ...project, ...patch, updatedAt: now() };
		this.projects.set(id, updated);
		return updated;
	}

	async deleteProject(id: string): Promise<void> {
		this.projects.delete(id);
		for (const [tid, task] of this.tasks) {
			if (task.projectId === id) {
				this.tasks.set(tid, { ...task, projectId: null });
			}
		}
	}

	async getTags(): Promise<Tag[]> {
		return Array.from(this.tags.values());
	}

	async createTag(input: CreateTagInput): Promise<Tag> {
		const tag: Tag = {
			id: uuid(),
			name: input.name,
			color: input.color ?? null,
		};
		this.tags.set(tag.id, tag);
		return tag;
	}

	async updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag> {
		const tag = this.tags.get(id);
		if (!tag) throw new Error(`Tag ${id} not found`);
		const updated: Tag = { ...tag, ...patch };
		this.tags.set(id, updated);
		return updated;
	}

	async deleteTag(id: string): Promise<void> {
		this.tags.delete(id);
	}

	async getSettings(): Promise<Record<string, string>> {
		return Object.fromEntries(this.settings);
	}

	async setSetting(key: string, value: string): Promise<void> {
		this.settings.set(key, value);
	}
}
