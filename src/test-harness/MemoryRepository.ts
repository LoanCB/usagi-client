import { generateKeyBetween } from "fractional-indexing";
import type { ImportGaps, ImportReferents } from "@/db/import-resolution";
import {
	countImportGaps,
	predictReferents,
	resolveProjectRef,
	resolveTagLink,
} from "@/db/import-resolution";
import type { TodoRepository } from "@/db/repository";
import type { ExportData } from "@/lib/dataTransfer";
import type {
	CreateProjectGroupInput,
	CreateProjectInput,
	CreateTagInput,
	CreateTaskInput,
	Priority,
	Project,
	ProjectGroup,
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

/**
 * Where to splice the moved row into `ordered` (which excludes it).
 *
 * Anchors on prevId when present; nextId only matters when prevId is null,
 * i.e. the move is to the very top — this is what makes nextId a genuine
 * input here rather than an unused twin of the real driver's signature.
 */
function insertionIndex<T extends { id: string }>(
	ordered: T[],
	prevId: string | null,
	nextId: string | null,
): number {
	if (prevId) {
		const prevIndex = ordered.findIndex((r) => r.id === prevId);
		return prevIndex === -1 ? 0 : prevIndex + 1;
	}
	if (nextId) {
		const nextIndex = ordered.findIndex((r) => r.id === nextId);
		return nextIndex === -1 ? 0 : nextIndex;
	}
	return 0;
}

function byKey<T extends { sortKey: string }>(a: T, b: T): number {
	return a.sortKey < b.sortKey ? -1 : 1;
}

/**
 * An in-memory stand-in for SqliteRepository.
 *
 * Ordering models what the real repository does — insertion order maintained by
 * fractional keys, new rows at the top — rather than the sort_order renumbering
 * it used to do. That renumbering made every reorder driven through this double
 * look correct even against a UI that had stopped consuming repository order,
 * which is exactly how the sidebar reorder shipped broken.
 */
export class MemoryRepository implements TodoRepository {
	// Insertion-ordered: getTasks returns map order, moveTask rebuilds it.
	private tasks = new Map<string, Task>();
	private projects = new Map<string, Project>();
	private projectGroups = new Map<string, ProjectGroup>();
	private tags = new Map<string, Tag>();
	private settings = new Map<string, string>([
		["notification_enabled", "false"],
	]);
	private sortCounter = 0;

	/**
	 * A key above every project and group, which share one key space here for
	 * the same reason they do in SQL: the sidebar's top level interleaves them.
	 */
	private projectSpaceHeadKey(): string {
		const keys = [
			...Array.from(this.projects.values()).map((p) => p.sortKey),
			...Array.from(this.projectGroups.values()).map((g) => g.sortKey),
		];
		return generateKeyBetween(null, keys.length === 0 ? null : keys.sort()[0]);
	}

	private projectSpaceKeyOf(id: string | null): string | null {
		if (id === null) return null;
		return (
			this.projects.get(id)?.sortKey ??
			this.projectGroups.get(id)?.sortKey ??
			null
		);
	}

	/** Rebuild `map` so its iteration order matches `ordered`. */
	private static reseat<T extends { id: string }>(
		map: Map<string, T>,
		ordered: T[],
	): void {
		map.clear();
		for (const row of ordered) map.set(row.id, row);
	}

	async getTasks(filters: TaskFilters = {}): Promise<Task[]> {
		let results = Array.from(this.tasks.values()).filter(
			(t) => t.deletedAt === null,
		);

		if (!filters.allTasks) {
			if (filters.completed === true) {
				results = results.filter((t) => t.completedAt !== null);
			} else {
				const now = new Date();
				const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
				results = results.filter((t) => {
					if (t.completedAt === null) return true;
					const d = new Date(t.completedAt);
					const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
					return localDate >= todayStr;
				});
			}
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
			const dueBefore = filters.dueBefore;
			results = results.filter(
				(t) => t.dueDate !== null && t.dueDate <= dueBefore,
			);
		}

		// Map iteration order is the order of the list; moveTask rebuilds it.
		return results;
	}

	async getTask(id: string): Promise<Task | null> {
		const task = this.tasks.get(id) ?? null;
		if (task === null || task.deletedAt !== null) return null;
		return task;
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
			deletedAt: null,
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

	async moveTasksToProject(
		taskIds: string[],
		projectId: string | null,
	): Promise<void> {
		for (const id of taskIds) {
			const task = this.tasks.get(id);
			if (task) {
				this.tasks.set(id, { ...task, projectId, updatedAt: now() });
			}
		}
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

	async archiveTask(id: string): Promise<void> {
		const task = this.tasks.get(id);
		if (!task) return;
		this.tasks.set(id, { ...task, deletedAt: now(), updatedAt: now() });
	}

	async deleteTask(id: string): Promise<void> {
		this.tasks.delete(id);
	}

	async unarchiveTask(id: string): Promise<void> {
		const task = this.tasks.get(id);
		if (!task) return;
		this.tasks.set(id, { ...task, deletedAt: null, updatedAt: now() });
	}

	async getArchivedTasks(): Promise<Task[]> {
		return Array.from(this.tasks.values())
			.filter((t) => t.deletedAt !== null)
			.sort((a, b) => ((b.deletedAt ?? "") > (a.deletedAt ?? "") ? 1 : -1));
	}

	async moveTask(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const task = this.tasks.get(id);
		if (!task) return;
		const ordered = Array.from(this.tasks.values()).filter((t) => t.id !== id);
		ordered.splice(insertionIndex(ordered, prevId, nextId), 0, {
			...task,
			updatedAt: now(),
		});
		MemoryRepository.reseat(this.tasks, ordered);
	}

	/**
	 * Resolves references the same way SqliteRepository does, through the same
	 * module.
	 *
	 * This map enforces no referential integrity, so it used to keep a projectId
	 * pointing at nothing and hand a store test a state the real app cannot
	 * reach. That divergence is how a whole class of import bug survived review;
	 * MemoryRepository.test.ts pins the two together.
	 */
	async bulkImport(
		data: ExportData,
		strategy: "merge" | "replace",
	): Promise<void> {
		if (strategy === "replace") {
			this.tasks.clear();
			this.tags.clear();
			this.projects.clear();
		}

		for (const project of data.projects) {
			this.projects.set(project.id, project);
		}

		const referents = this.referents(data, strategy);

		for (const tag of data.tags) {
			if (strategy === "merge" && !referents.tagIds.has(tag.id)) continue;
			this.tags.set(tag.id, {
				...tag,
				projectId: resolveProjectRef(tag.projectId, referents.projectIds),
			});
		}

		for (const task of data.tasks) {
			const resolvedTags = task.tags.flatMap((t) => {
				const id = resolveTagLink(t, referents);
				const resolved = id === null ? undefined : this.tags.get(id);
				return resolved ? [resolved] : [];
			});
			this.tasks.set(task.id, {
				...task,
				projectId: resolveProjectRef(task.projectId, referents.projectIds),
				tags: resolvedTags,
			});
		}
	}

	async previewImport(
		data: ExportData,
		strategy: "merge" | "replace",
	): Promise<ImportGaps> {
		return countImportGaps(data, this.referents(data, strategy));
	}

	private referents(
		data: ExportData,
		strategy: "merge" | "replace",
	): ImportReferents {
		return predictReferents(
			data,
			{
				projectIds: Array.from(this.projects.keys()),
				tags: Array.from(this.tags.values()),
			},
			strategy,
		);
	}

	async getProjects(): Promise<Project[]> {
		return Array.from(this.projects.values()).sort(byKey);
	}

	async createProject(input: CreateProjectInput): Promise<Project> {
		const project: Project = {
			id: uuid(),
			name: input.name,
			color: input.color ?? null,
			icon: input.icon ?? null,
			// A creation counter, kept only so the legacy field has a value. It
			// deliberately disagrees with sortKey once anything is moved, so a
			// consumer that still orders on it is caught rather than masked.
			sortOrder: ++this.sortCounter,
			sortKey: this.projectSpaceHeadKey(),
			groupId: null,
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
		const projectTagIds = new Set<string>();
		for (const t of this.tags.values()) {
			if (t.projectId === id) projectTagIds.add(t.id);
		}
		for (const tagId of projectTagIds) {
			this.tags.delete(tagId);
		}
		for (const [tid, task] of this.tasks) {
			const filteredTags = task.tags.filter((t) => !projectTagIds.has(t.id));
			this.tasks.set(tid, { ...task, tags: filteredTags });
		}
		this.projects.delete(id);
	}

	async getProjectGroups(): Promise<ProjectGroup[]> {
		return Array.from(this.projectGroups.values()).sort(byKey);
	}

	async createProjectGroup(
		input: CreateProjectGroupInput,
	): Promise<ProjectGroup> {
		const group: ProjectGroup = {
			id: uuid(),
			name: input.name,
			color: input.color,
			sortOrder: ++this.sortCounter,
			sortKey: this.projectSpaceHeadKey(),
			createdAt: now(),
			updatedAt: now(),
		};
		this.projectGroups.set(group.id, group);
		return group;
	}

	async updateProjectGroup(
		id: string,
		patch: Partial<Pick<ProjectGroup, "name" | "color">>,
	): Promise<ProjectGroup> {
		const group = this.projectGroups.get(id);
		if (!group) throw new Error(`ProjectGroup ${id} not found`);
		const updated: ProjectGroup = { ...group, ...patch, updatedAt: now() };
		this.projectGroups.set(id, updated);
		return updated;
	}

	async deleteProjectGroup(id: string): Promise<void> {
		this.projectGroups.delete(id);
	}

	/**
	 * Rekeys only the moved row, like the real repository — sortOrder is left
	 * alone, so a consumer still ordering on it observes the stale order it
	 * deserves instead of a renumbering that quietly agrees with the new one.
	 */
	async moveProject(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const project = this.projects.get(id);
		if (!project) return;
		this.projects.set(id, {
			...project,
			sortKey: generateKeyBetween(
				this.projectSpaceKeyOf(prevId),
				this.projectSpaceKeyOf(nextId),
			),
			updatedAt: now(),
		});
	}

	/** Mirrors moveProject — same shared key space, same single-row rekey. */
	async moveProjectGroup(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const group = this.projectGroups.get(id);
		if (!group) return;
		this.projectGroups.set(id, {
			...group,
			sortKey: generateKeyBetween(
				this.projectSpaceKeyOf(prevId),
				this.projectSpaceKeyOf(nextId),
			),
			updatedAt: now(),
		});
	}

	async assignProjectToGroup(
		projectId: string,
		groupId: string | null,
	): Promise<void> {
		const project = this.projects.get(projectId);
		if (project) this.projects.set(projectId, { ...project, groupId });
	}

	async getTags(projectId?: string | null): Promise<Tag[]> {
		const all = Array.from(this.tags.values());
		if (projectId === undefined) return all;
		if (projectId === null) return all.filter((t) => t.projectId === null);
		return all.filter((t) => t.projectId === null || t.projectId === projectId);
	}

	async createTag(input: CreateTagInput): Promise<Tag> {
		const tag: Tag = {
			id: uuid(),
			name: input.name,
			color: input.color ?? null,
			projectId: input.projectId ?? null,
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

	async isTagUsedInProjectTasks(tagId: string): Promise<boolean> {
		return Array.from(this.tasks.values()).some(
			(task) =>
				task.projectId !== null && task.tags.some((t) => t.id === tagId),
		);
	}

	async getSettings(): Promise<Record<string, string>> {
		return Object.fromEntries(this.settings);
	}

	async setSetting(key: string, value: string): Promise<void> {
		this.settings.set(key, value);
	}
}
