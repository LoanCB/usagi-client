export type Priority = "none" | "low" | "medium" | "high";

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
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

export interface TaskFilters {
	projectId?: string | null; // null = Inbox, undefined = all projects
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
