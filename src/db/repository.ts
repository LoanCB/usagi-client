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
	archiveTask(id: string): Promise<void>;
	deleteTask(id: string): Promise<void>;
	unarchiveTask(id: string): Promise<void>;
	getArchivedTasks(): Promise<Task[]>;
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
	getTags(projectId?: string | null): Promise<Tag[]>;
	createTag(input: CreateTagInput): Promise<Tag>;
	updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag>;
	deleteTag(id: string): Promise<void>;
	isTagUsedInProjectTasks(tagId: string): Promise<boolean>;

	// Settings
	getSettings(): Promise<Record<string, string>>;
	setSetting(key: string, value: string): Promise<void>;
}
