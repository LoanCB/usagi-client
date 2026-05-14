import type {
	CreateProjectInput,
	CreateTagInput,
	CreateTaskInput,
	Project,
	Tag,
	Task,
	TaskFilters,
} from "@/types";

export interface TodoRepository {
	// Tasks
	getTasks(filters?: TaskFilters): Promise<Task[]>;
	getTask(id: string): Promise<Task | null>;
	createTask(input: CreateTaskInput): Promise<Task>;
	updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task>;
	completeTask(id: string): Promise<Task>;
	uncompleteTask(id: string): Promise<Task>;
	deleteTask(id: string): Promise<void>;
	reorderTasks(orderedIds: string[]): Promise<void>;

	// Projects
	getProjects(): Promise<Project[]>;
	createProject(input: CreateProjectInput): Promise<Project>;
	updateProject(
		id: string,
		patch: Partial<CreateProjectInput>,
	): Promise<Project>;
	deleteProject(id: string): Promise<void>;

	// Tags
	getTags(): Promise<Tag[]>;
	createTag(input: CreateTagInput): Promise<Tag>;
	updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag>;
	deleteTag(id: string): Promise<void>;

	// Settings
	getSettings(): Promise<Record<string, string>>;
	setSetting(key: string, value: string): Promise<void>;
}
