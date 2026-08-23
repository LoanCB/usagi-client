import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useTagStore } from "@/store/tags";
import type { CreateProjectInput, Project } from "@/types";

interface ProjectStore {
	projects: Project[];
	loadProjects(repo: TodoRepository): Promise<void>;
	createProject(
		repo: TodoRepository,
		input: CreateProjectInput,
	): Promise<Project>;
	updateProject(
		repo: TodoRepository,
		id: string,
		patch: Partial<CreateProjectInput>,
	): Promise<void>;
	deleteProject(repo: TodoRepository, id: string): Promise<void>;
	moveProject(
		repo: TodoRepository,
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void>;
	assignToGroup(
		repo: TodoRepository,
		projectId: string,
		groupId: string | null,
	): Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
	projects: [],

	async loadProjects(repo) {
		const projects = await repo.getProjects();
		set({ projects });
	},

	async createProject(repo, input) {
		const project = await repo.createProject(input);
		// Prepended, because the repository keys a new project above every other
		// one. Appending showed it in one place until the next reload moved it.
		set((s) => ({ projects: [project, ...s.projects] }));
		return project;
	},

	async updateProject(repo, id, patch) {
		const updated = await repo.updateProject(id, patch);
		set((s) => ({
			projects: s.projects.map((p) => (p.id === id ? updated : p)),
		}));
	},

	async deleteProject(repo, id) {
		await repo.deleteProject(id);
		set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
		useTagStore.setState((s) => ({
			tags: s.tags.filter((t) => t.projectId !== id),
		}));
	},

	async moveProject(repo, id, prevId, nextId) {
		await repo.moveProject(id, prevId, nextId);
		const projects = await repo.getProjects();
		set({ projects });
	},

	async assignToGroup(repo, projectId, groupId) {
		const prevGroupId =
			get().projects.find((p) => p.id === projectId)?.groupId ?? null;
		await repo.assignProjectToGroup(projectId, groupId);
		set((s) => ({
			projects: s.projects.map((p) =>
				p.id === projectId ? { ...p, groupId } : p,
			),
		}));
		if (prevGroupId && prevGroupId !== groupId) {
			const remaining = get().projects.filter((p) => p.groupId === prevGroupId);
			if (remaining.length === 0) {
				await useProjectGroupStore.getState().deleteGroup(repo, prevGroupId);
			}
		}
	},
}));
