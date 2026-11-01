import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import type { Project, ProjectGroup } from "@/types";
import { useArchiveStore } from "./archives";
import { useProjectGroupStore } from "./projectGroups";
import { useProjectStore } from "./projects";
import { useTaskStore } from "./tasks";
import { useUIStore } from "./ui";

let repo: MemoryRepository;
let project: Project;
let group: ProjectGroup;

const archive = () => useArchiveStore.getState();

beforeEach(async () => {
	repo = new MemoryRepository();
	project = await repo.createProject({ name: "Project" });
	group = await repo.createProjectGroup({ name: "Group", color: "#111111" });
	await repo.createTask({ title: "in project", projectId: project.id });
	await repo.createTask({ title: "in inbox" });
	await useProjectStore.getState().loadProjects(repo);
	await useProjectGroupStore.getState().loadGroups(repo);
	await useTaskStore.getState().loadTasks(repo);
	await archive().load(repo);
	useUIStore.setState({ selectedProjectId: undefined, selectedTaskId: null });
});

describe("useArchiveStore", () => {
	it("moves an archived project out of the sidebar's store", async () => {
		await archive().archiveProject(repo, project.id);

		expect(useProjectStore.getState().projects).toEqual([]);
		expect(archive().projects.map((p) => p.id)).toEqual([project.id]);
	});

	it("drops the project's tasks from the current view and the counts", async () => {
		await archive().archiveProject(repo, project.id);

		const tasks = useTaskStore.getState();
		expect(tasks.tasks.map((t) => t.title)).toEqual(["in inbox"]);
		expect(tasks.allCount).toBe(1);
		expect(archive().tasks.map((t) => t.title)).toEqual(["in project"]);
	});

	it("leaves a view that is about to become read-only", async () => {
		useUIStore.setState({ selectedProjectId: project.id });

		await archive().archiveProject(repo, project.id);

		expect(useUIStore.getState().selectedProjectId).toBeUndefined();
	});

	it("closes the detail panel of a task that just left the view", async () => {
		const task = useTaskStore
			.getState()
			.tasks.find((t) => t.title === "in project");
		useUIStore.setState({ selectedTaskId: task?.id });

		await archive().archiveProject(repo, project.id);

		expect(useUIStore.getState().selectedTaskId).toBeNull();
	});

	it("keeps another project's view open", async () => {
		const other = await repo.createProject({ name: "Other" });
		useUIStore.setState({ selectedProjectId: other.id });

		await archive().archiveProject(repo, project.id);

		expect(useUIStore.getState().selectedProjectId).toBe(other.id);
	});

	it("brings a restored project back with its tasks", async () => {
		await archive().archiveProject(repo, project.id);
		await archive().restoreProject(repo, project.id);

		expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual([
			project.id,
		]);
		expect(archive().projects).toEqual([]);
		expect(archive().tasks).toEqual([]);
		expect(useTaskStore.getState().allCount).toBe(2);
	});

	it("archives a group, leaving any view inside it", async () => {
		await useProjectStore.getState().assignToGroup(repo, project.id, group.id);
		useUIStore.setState({ selectedProjectId: project.id });

		await archive().archiveGroup(repo, group.id);

		expect(useProjectGroupStore.getState().groups).toEqual([]);
		expect(useProjectStore.getState().projects).toEqual([]);
		expect(archive().groups.map((g) => g.id)).toEqual([group.id]);
		expect(archive().projects.map((p) => p.id)).toEqual([project.id]);
		expect(useUIStore.getState().selectedProjectId).toBeUndefined();
		expect(useTaskStore.getState().tasks.map((t) => t.title)).toEqual([
			"in inbox",
		]);
	});

	it("restores a group with its projects", async () => {
		await useProjectStore.getState().assignToGroup(repo, project.id, group.id);
		await archive().archiveGroup(repo, group.id);
		await archive().restoreGroup(repo, group.id);

		expect(useProjectGroupStore.getState().groups.map((g) => g.id)).toEqual([
			group.id,
		]);
		expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual([
			project.id,
		]);
		expect(archive().groups).toEqual([]);
	});
});
