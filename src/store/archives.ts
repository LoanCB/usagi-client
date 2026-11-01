import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project, ProjectGroup, Task } from "@/types";

interface ArchiveStore {
	/** Archived directly or through a group in `groups`. */
	projects: Project[];
	groups: ProjectGroup[];
	/** Tasks living in `projects`, excluding those archived on their own. */
	tasks: Task[];
	load(repo: TodoRepository): Promise<void>;
	archiveProject(repo: TodoRepository, id: string): Promise<void>;
	restoreProject(repo: TodoRepository, id: string): Promise<void>;
	archiveGroup(repo: TodoRepository, id: string): Promise<void>;
	restoreGroup(repo: TodoRepository, id: string): Promise<void>;
}

/** Drops what was just archived from the view it was showing in. */
function leaveProjects(projectIds: ReadonlySet<string>): void {
	const inProjects = (task: Task) =>
		task.projectId !== null && projectIds.has(task.projectId);
	const { selectedProjectId, selectedTaskId, setSelectedProject } =
		useUIStore.getState();
	const { tasks } = useTaskStore.getState();
	if (selectedProjectId && projectIds.has(selectedProjectId)) {
		setSelectedProject(undefined);
	} else if (tasks.some((t) => t.id === selectedTaskId && inProjects(t))) {
		useUIStore.getState().setSelectedTask(null);
	}
	useTaskStore.setState({ tasks: tasks.filter((t) => !inProjects(t)) });
}

async function reloadAfterChange(repo: TodoRepository): Promise<void> {
	await Promise.all([
		useArchiveStore.getState().load(repo),
		useProjectStore.getState().loadProjects(repo),
		useProjectGroupStore.getState().loadGroups(repo),
		useTaskStore.getState().loadArchivedTasks(repo),
		useTaskStore.getState().refreshCounts(repo),
	]);
}

export const useArchiveStore = create<ArchiveStore>((set) => ({
	projects: [],
	groups: [],
	tasks: [],

	async load(repo) {
		const [projects, groups, tasks] = await Promise.all([
			repo.getArchivedProjects(),
			repo.getArchivedProjectGroups(),
			repo.getTasks({ allTasks: true, archivedProjects: "only" }),
		]);
		set({ projects, groups, tasks });
	},

	async archiveProject(repo, id) {
		await repo.archiveProject(id);
		leaveProjects(new Set([id]));
		await reloadAfterChange(repo);
	},

	async restoreProject(repo, id) {
		await repo.unarchiveProject(id);
		await reloadAfterChange(repo);
	},

	async archiveGroup(repo, id) {
		const members = useProjectStore
			.getState()
			.projects.filter((p) => p.groupId === id);
		await repo.archiveProjectGroup(id);
		leaveProjects(new Set(members.map((p) => p.id)));
		await reloadAfterChange(repo);
	},

	async restoreGroup(repo, id) {
		await repo.unarchiveProjectGroup(id);
		await reloadAfterChange(repo);
	},
}));
