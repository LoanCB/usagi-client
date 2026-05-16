import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import type { CreateProjectInput, Project } from "@/types";
import { useTagStore } from "@/store/tags";

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
}

export const useProjectStore = create<ProjectStore>((set) => ({
	projects: [],

	async loadProjects(repo) {
		const projects = await repo.getProjects();
		set({ projects });
	},

	async createProject(repo, input) {
		const project = await repo.createProject(input);
		set((s) => ({ projects: [...s.projects, project] }));
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
		useTagStore.setState((s) => ({ tags: s.tags.filter((t) => t.projectId !== id) }));
	},
}));
