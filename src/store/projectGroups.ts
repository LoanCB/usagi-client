import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import type { CreateProjectGroupInput, ProjectGroup } from "@/types";

interface ProjectGroupStore {
	groups: ProjectGroup[];
	loadGroups(repo: TodoRepository): Promise<void>;
	createGroup(
		repo: TodoRepository,
		input: CreateProjectGroupInput,
	): Promise<ProjectGroup>;
	updateGroup(
		repo: TodoRepository,
		id: string,
		patch: Partial<Pick<ProjectGroup, "name" | "color">>,
	): Promise<void>;
	deleteGroup(repo: TodoRepository, id: string): Promise<void>;
	moveGroup(
		repo: TodoRepository,
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void>;
}

export const useProjectGroupStore = create<ProjectGroupStore>((set) => ({
	groups: [],

	async loadGroups(repo) {
		const groups = await repo.getProjectGroups();
		set({ groups });
	},

	async createGroup(repo, input) {
		const group = await repo.createProjectGroup(input);
		set((s) => ({ groups: [...s.groups, group] }));
		return group;
	},

	async updateGroup(repo, id, patch) {
		const updated = await repo.updateProjectGroup(id, patch);
		set((s) => ({
			groups: s.groups.map((g) => (g.id === id ? updated : g)),
		}));
	},

	async deleteGroup(repo, id) {
		await repo.deleteProjectGroup(id);
		set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
	},

	async moveGroup(repo, id, prevId, nextId) {
		await repo.moveProjectGroup(id, prevId, nextId);
		const groups = await repo.getProjectGroups();
		set({ groups });
	},
}));
