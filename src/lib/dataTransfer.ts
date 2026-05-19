import type { TodoRepository } from "@/db/repository";
import type { Project, Tag, Task } from "@/types";

export const INBOX_PROJECT_ID = "__inbox__" as const;

export interface ExportData {
	version: 1;
	exportedAt: string;
	projects: Project[];
	tags: Tag[];
	tasks: Task[];
}

export interface ExportOptions {
	activeTasks: boolean;
	completedTasks: boolean;
	archivedTasks: boolean;
	projects: boolean;
	tags: boolean;
	projectIds?: string[] | null; // undefined or null = all projects
}

export async function exportData(
	repo: TodoRepository,
	options: ExportOptions,
): Promise<ExportData> {
	const allNonArchived = await repo.getTasks({ allTasks: true });
	const archived = options.archivedTasks ? await repo.getArchivedTasks() : [];

	let tasks: Task[] = [
		...(options.activeTasks
			? allNonArchived.filter((t) => t.completedAt === null)
			: []),
		...(options.completedTasks
			? allNonArchived.filter((t) => t.completedAt !== null)
			: []),
		...archived,
	];

	const projectIds = options.projectIds ?? null;
	const projectSet = projectIds !== null ? new Set(projectIds) : null;

	if (projectSet !== null) {
		tasks = tasks.filter((t) =>
			t.projectId === null
				? projectSet.has(INBOX_PROJECT_ID)
				: projectSet.has(t.projectId),
		);
	}

	// When a project filter is active, always export the matching project records.
	const allProjects: Project[] =
		options.projects || projectSet ? await repo.getProjects() : [];
	const projects: Project[] =
		projectSet === null
			? allProjects
			: allProjects.filter((p) => projectSet.has(p.id));

	const allTags: Tag[] = options.tags ? await repo.getTags() : [];
	const tags: Tag[] =
		projectSet === null
			? allTags
			: allTags.filter(
					(t) => t.projectId === null || projectSet.has(t.projectId),
				);

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		projects,
		tags,
		tasks,
	};
}
