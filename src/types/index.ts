export type Priority =
	| "none"
	| "lowest"
	| "low"
	| "medium"
	| "high"
	| "highest"
	| "blocker";

export interface Tag {
	id: string;
	name: string;
	color: string | null;
	projectId: string | null;
}

export interface Task {
	id: string;
	title: string;
	description: string | null;
	projectId: string | null;
	priority: Priority;
	dueDate: string | null; // ISO 8601 date string
	completedAt: string | null; // ISO 8601 datetime, null = not completed
	deletedAt: string | null;
	tags: Tag[];
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

export interface Project {
	id: string;
	name: string;
	color: string | null;
	icon: string | null;
	/** @deprecated Legacy column, no longer written. Order by `sortKey`. */
	sortOrder: number;
	/**
	 * Fractional index. Projects and project groups share one key space, so a
	 * group and a standalone project compare directly in the top-level list.
	 */
	sortKey: string;
	groupId: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectGroup {
	id: string;
	name: string;
	color: string;
	/** @deprecated Legacy column, no longer written. Order by `sortKey`. */
	sortOrder: number;
	/** Same key space as `Project.sortKey` — see there. */
	sortKey: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateProjectGroupInput {
	name: string;
	color: string;
}

export interface TaskFilters {
	projectId?: string | null; // null = Inbox, undefined = all projects
	projectIds?: string[]; // multi-project filter; INBOX_PROJECT_ID = tasks with no project
	tagIds?: string[];
	priority?: Priority;
	completed?: boolean; // undefined = non-completed only (default)
	dueBefore?: string; // ISO date, inclusive
	allTasks?: boolean; // when true, returns all tasks regardless of completion status
}

export interface CreateTaskInput {
	title: string;
	description?: string | null;
	projectId?: string | null;
	priority?: Priority;
	dueDate?: string | null;
	tagIds?: string[];
}

export interface CreateProjectInput {
	name: string;
	color?: string;
	icon?: string;
}

export interface CreateTagInput {
	name: string;
	color?: string;
	projectId?: string | null;
}
