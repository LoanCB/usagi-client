import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import type { Project } from "@/types";
import { useProjectStore } from "./projects";

const baseProject: Project = {
	id: "p1",
	name: "Inbox",
	color: "#3b82f6",
	icon: null,
	sortOrder: 0,
	createdAt: "2026-04-01T00:00:00.000Z",
	updatedAt: "2026-04-01T00:00:00.000Z",
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
	return {
		getTasks: vi.fn(),
		getTask: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		completeTask: vi.fn(),
		uncompleteTask: vi.fn(),
		deleteTask: vi.fn(),
		reorderTasks: vi.fn(),
		getProjects: vi.fn().mockResolvedValue([baseProject]),
		createProject: vi.fn().mockResolvedValue(baseProject),
		updateProject: vi.fn().mockResolvedValue(baseProject),
		deleteProject: vi.fn().mockResolvedValue(undefined),
		getTags: vi.fn(),
		createTag: vi.fn(),
		updateTag: vi.fn(),
		deleteTag: vi.fn(),
		getSettings: vi.fn().mockResolvedValue({}),
		setSetting: vi.fn().mockResolvedValue(undefined),
		bulkImport: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as TodoRepository;
}

describe("useProjectStore", () => {
	beforeEach(() => {
		useProjectStore.setState({ projects: [] });
	});

	it("loadProjects populates projects from repository", async () => {
		const repo = makeRepo();
		await useProjectStore.getState().loadProjects(repo);
		expect(useProjectStore.getState().projects).toHaveLength(1);
		expect(useProjectStore.getState().projects[0].name).toBe("Inbox");
	});

	it("createProject appends new project to end of list", async () => {
		const newProject: Project = { ...baseProject, id: "p2", name: "Work" };
		const repo = makeRepo({
			createProject: vi.fn().mockResolvedValue(newProject),
		});
		await useProjectStore.getState().createProject(repo, { name: "Work" });
		const projects = useProjectStore.getState().projects;
		expect(projects[projects.length - 1].id).toBe("p2");
	});

	it("updateProject replaces the correct project in-place", async () => {
		const updated: Project = { ...baseProject, name: "Updated" };
		useProjectStore.setState({ projects: [baseProject] });
		const repo = makeRepo({
			updateProject: vi.fn().mockResolvedValue(updated),
		});
		await useProjectStore
			.getState()
			.updateProject(repo, "p1", { name: "Updated" });
		expect(useProjectStore.getState().projects[0].name).toBe("Updated");
	});

	it("deleteProject removes project from list", async () => {
		useProjectStore.setState({ projects: [baseProject] });
		const repo = makeRepo({
			deleteProject: vi.fn().mockResolvedValue(undefined),
		});
		await useProjectStore.getState().deleteProject(repo, "p1");
		expect(useProjectStore.getState().projects).toHaveLength(0);
	});
});
