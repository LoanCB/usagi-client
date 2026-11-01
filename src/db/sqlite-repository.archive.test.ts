// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { exportData } from "@/lib/dataTransfer";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import type { Project, ProjectGroup } from "@/types";
import { ALL_MIGRATIONS } from "./migrations/index";
import { runMigrations } from "./migrations/run-migrations";
import type { TodoRepository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";

const ALL_TASKS = { allTasks: true } as const;

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();
const ids = (rows: Project[] | ProjectGroup[]) => rows.map((r) => r.id);

async function realRepo(): Promise<{
	repo: SqliteRepository;
	driver: BetterSqliteDriver;
}> {
	const driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	return { repo: new SqliteRepository(driver), driver };
}

// Run against both so the harness cannot tell the store tests and the e2e suite
// a story about archiving that the app does not live by.
describe.each<[string, () => Promise<TodoRepository>]>([
	["SqliteRepository", async () => (await realRepo()).repo],
	["MemoryRepository", async () => new MemoryRepository()],
])("archiving projects and groups — %s", (_name, makeRepo) => {
	let repo: TodoRepository;
	let project: Project;
	let other: Project;
	let group: ProjectGroup;

	beforeEach(async () => {
		repo = await makeRepo();
		project = await repo.createProject({ name: "Project" });
		other = await repo.createProject({ name: "Other" });
		group = await repo.createProjectGroup({ name: "Group", color: "#111111" });
		await repo.createTask({ title: "in project", projectId: project.id });
		await repo.createTask({ title: "in other", projectId: other.id });
		await repo.createTask({ title: "in inbox" });
	});

	it("takes an archived project out of the active list, keeping its row", async () => {
		await repo.archiveProject(project.id);

		expect(ids(await repo.getProjects())).toEqual([other.id]);
		const archived = await repo.getArchivedProjects();
		expect(ids(archived)).toEqual([project.id]);
		expect(archived[0].archivedAt).not.toBeNull();
	});

	it("hides the tasks of an archived project from every global read", async () => {
		await repo.archiveProject(project.id);

		expect(titles(await repo.getTasks())).toEqual(["in inbox", "in other"]);
		expect(titles(await repo.getTasks(ALL_TASKS))).toEqual([
			"in inbox",
			"in other",
		]);
	});

	it("still serves those tasks to a read scoped to that project", async () => {
		await repo.archiveProject(project.id);

		expect(titles(await repo.getTasks({ projectId: project.id }))).toEqual([
			"in project",
		]);
	});

	it("lists only tasks living in archived projects with archivedProjects: only", async () => {
		await repo.archiveProject(project.id);

		expect(
			titles(await repo.getTasks({ ...ALL_TASKS, archivedProjects: "only" })),
		).toEqual(["in project"]);
	});

	it("restores a project with its tasks", async () => {
		await repo.archiveProject(project.id);
		await repo.unarchiveProject(project.id);

		expect(ids(await repo.getProjects()).sort()).toEqual(
			[project.id, other.id].sort(),
		);
		expect(await repo.getArchivedProjects()).toEqual([]);
		expect(titles(await repo.getTasks())).toContain("in project");
	});

	it("keeps a task archived on its own archived after a project round trip", async () => {
		const solo = await repo.createTask({
			title: "solo",
			projectId: project.id,
		});
		await repo.archiveTask(solo.id);

		await repo.archiveProject(project.id);
		await repo.unarchiveProject(project.id);

		expect(titles(await repo.getTasks({ projectId: project.id }))).toEqual([
			"in project",
		]);
		expect(titles(await repo.getArchivedTasks())).toEqual(["solo"]);
	});

	it("keeps archived tasks of an archived project out of the task archive", async () => {
		const solo = await repo.createTask({
			title: "solo",
			projectId: project.id,
		});
		await repo.archiveTask(solo.id);
		await repo.archiveProject(project.id);

		expect(await repo.getArchivedTasks()).toEqual([]);
		expect(
			titles(await repo.getArchivedTasks({ archivedProjects: "include" })),
		).toEqual(["solo"]);
	});

	it("puts a restored project back in its group", async () => {
		await repo.assignProjectToGroup(project.id, group.id);
		await repo.archiveProject(project.id);
		await repo.unarchiveProject(project.id);

		const restored = (await repo.getProjects()).find(
			(p) => p.id === project.id,
		);
		expect(restored?.groupId).toBe(group.id);
	});

	it("archives a group with its projects and their tasks", async () => {
		await repo.assignProjectToGroup(project.id, group.id);
		await repo.archiveProjectGroup(group.id);

		expect(await repo.getProjectGroups()).toEqual([]);
		expect(ids(await repo.getArchivedProjectGroups())).toEqual([group.id]);
		expect(ids(await repo.getProjects())).toEqual([other.id]);
		expect(ids(await repo.getArchivedProjects())).toEqual([project.id]);
		expect(titles(await repo.getTasks())).toEqual(["in inbox", "in other"]);
	});

	it("marks only the group, so its projects keep archivedAt null", async () => {
		await repo.assignProjectToGroup(project.id, group.id);
		await repo.archiveProjectGroup(group.id);

		expect((await repo.getArchivedProjects())[0].archivedAt).toBeNull();
	});

	it("restores a group with its projects and their tasks", async () => {
		await repo.assignProjectToGroup(project.id, group.id);
		await repo.archiveProjectGroup(group.id);
		await repo.unarchiveProjectGroup(group.id);

		expect(ids(await repo.getProjectGroups())).toEqual([group.id]);
		expect(await repo.getArchivedProjects()).toEqual([]);
		expect(titles(await repo.getTasks())).toContain("in project");
	});

	it("leaves a project archived on its own archived when its group comes back", async () => {
		await repo.assignProjectToGroup(project.id, group.id);
		await repo.archiveProject(project.id);
		await repo.archiveProjectGroup(group.id);
		await repo.unarchiveProjectGroup(group.id);

		expect(ids(await repo.getArchivedProjects())).toEqual([project.id]);
	});

	it("exports archived projects and all their tasks, so a replace import keeps them", async () => {
		const solo = await repo.createTask({
			title: "solo",
			projectId: project.id,
		});
		await repo.archiveTask(solo.id);
		await repo.archiveProject(project.id);

		const data = await exportData(repo, {
			activeTasks: true,
			completedTasks: true,
			archivedTasks: true,
			projects: true,
			tags: true,
		});
		expect(data.projects.map((p) => p.name).sort()).toEqual([
			"Other",
			"Project",
		]);
		expect(titles(data.tasks)).toEqual([
			"in inbox",
			"in other",
			"in project",
			"solo",
		]);

		await repo.bulkImport(data, "replace");

		expect(ids(await repo.getArchivedProjects())).toEqual([project.id]);
		expect(titles(await repo.getTasks({ projectId: project.id }))).toEqual([
			"in project",
		]);
	});
});

describe("archiving — sync metadata", () => {
	it("stamps archived_at, so the archive survives a stale remote copy", async () => {
		const { repo, driver } = await realRepo();
		const project = await repo.createProject({ name: "Project" });
		const group = await repo.createProjectGroup({ name: "G", color: "#000" });

		await repo.archiveProject(project.id);
		await repo.archiveProjectGroup(group.id);

		const [projectRow] = await driver.select<{ field_updated_at: string }>(
			"SELECT field_updated_at FROM projects WHERE id = ?",
			[project.id],
		);
		const [groupRow] = await driver.select<{ field_updated_at: string }>(
			"SELECT field_updated_at FROM project_groups WHERE id = ?",
			[group.id],
		);
		expect(JSON.parse(projectRow.field_updated_at)).toHaveProperty(
			"archived_at",
		);
		expect(JSON.parse(groupRow.field_updated_at)).toHaveProperty("archived_at");
	});

	it("re-stamps on restore, so the restore outranks the archive", async () => {
		const { repo, driver } = await realRepo();
		const project = await repo.createProject({ name: "Project" });

		await repo.archiveProject(project.id);
		const stampOf = async () => {
			const [row] = await driver.select<{ field_updated_at: string }>(
				"SELECT field_updated_at FROM projects WHERE id = ?",
				[project.id],
			);
			return JSON.parse(row.field_updated_at).archived_at.t as string;
		};
		const archivedStamp = await stampOf();
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.unarchiveProject(project.id);

		expect((await stampOf()) > archivedStamp).toBe(true);
	});

	it("does not touch task rows, so nothing but one field has to sync", async () => {
		const { repo, driver } = await realRepo();
		const project = await repo.createProject({ name: "Project" });
		const task = await repo.createTask({
			title: "task",
			projectId: project.id,
		});
		await driver.execute("DELETE FROM sync_outbox", []);

		await repo.archiveProject(project.id);

		const dirty = await driver.select<{ entity_type: string }>(
			"SELECT entity_type FROM sync_outbox",
		);
		expect(dirty.map((d) => d.entity_type)).toEqual(["project"]);
		expect((await repo.getTask(task.id))?.deletedAt).toBeNull();
	});
});
