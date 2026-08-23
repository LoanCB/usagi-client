import type { ExportData } from "@/lib/dataTransfer";
import type {
	CreateProjectGroupInput,
	CreateProjectInput,
	CreateTagInput,
	CreateTaskInput,
	Project,
	ProjectGroup,
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
	moveTasksToProject(
		taskIds: string[],
		projectId: string | null,
	): Promise<void>;
	completeTask(id: string): Promise<Task>;
	uncompleteTask(id: string): Promise<Task>;
	archiveTask(id: string): Promise<void>;
	deleteTask(id: string): Promise<void>;
	unarchiveTask(id: string): Promise<void>;
	getArchivedTasks(): Promise<Task[]>;
	moveTask(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void>;
	bulkImport(data: ExportData, strategy: "merge" | "replace"): Promise<void>;

	// Projects
	getProjects(): Promise<Project[]>;
	createProject(input: CreateProjectInput): Promise<Project>;
	updateProject(
		id: string,
		patch: Partial<CreateProjectInput>,
	): Promise<Project>;
	deleteProject(id: string): Promise<void>;

	// Project Groups
	getProjectGroups(): Promise<ProjectGroup[]>;
	createProjectGroup(input: CreateProjectGroupInput): Promise<ProjectGroup>;
	updateProjectGroup(
		id: string,
		patch: Partial<Pick<ProjectGroup, "name" | "color">>,
	): Promise<ProjectGroup>;
	deleteProjectGroup(id: string): Promise<void>;
	moveProject(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void>;
	moveProjectGroup(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void>;
	assignProjectToGroup(
		projectId: string,
		groupId: string | null,
	): Promise<void>;

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
