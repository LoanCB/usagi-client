import { describe, expect, it, vi } from "vitest";
import type { DbDriver } from "./driver";
import { SqliteRepository } from "./sqlite-repository";

// Internal row shape — mirrors what SQLite returns
interface TaskRow {
	id: string;
	title: string;
	description: string | null;
	project_id: string | null;
	priority: string;
	due_date: string | null;
	completed_at: string | null;
	deleted_at: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
}

function makeDb(overrides: Partial<DbDriver> = {}): DbDriver {
	return {
		execute: vi.fn().mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 }),
		select: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}

describe("SqliteRepository — projects", () => {
	it("createProject inserts a row and returns a Project", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([
				{
					id: "proj-1",
					name: "Boulot",
					color: "#6366f1",
					icon: "💼",
					sort_order: 0,
					created_at: "2026-04-10T10:00:00.000Z",
					updated_at: "2026-04-10T10:00:00.000Z",
				},
			]),
		});
		const repo = new SqliteRepository(db);
		const project = await repo.createProject({
			name: "Boulot",
			color: "#6366f1",
			icon: "💼",
		});
		expect(project.name).toBe("Boulot");
		expect(project.color).toBe("#6366f1");
		expect(typeof project.id).toBe("string");
		expect(db.execute).toHaveBeenCalledOnce();
	});

	it("getProjects returns only non-deleted rows, mapped to Project", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([
				{
					id: "p1",
					name: "A",
					color: null,
					icon: null,
					sort_order: 0,
					created_at: "2026-04-10T10:00:00.000Z",
					updated_at: "2026-04-10T10:00:00.000Z",
				},
				{
					id: "p2",
					name: "B",
					color: "#f00",
					icon: "🚀",
					sort_order: 1,
					created_at: "2026-04-10T10:00:00.000Z",
					updated_at: "2026-04-10T10:00:00.000Z",
				},
			]),
		});
		const repo = new SqliteRepository(db);
		const projects = await repo.getProjects();
		expect(projects).toHaveLength(2);
		expect(projects[0]).toMatchObject({ id: "p1", name: "A" });
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("deleted_at IS NULL");
	});

	it("deleteProject sets deleted_at (soft delete)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteProject("proj-1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		const [sql, params] = calls[2]; // third call: UPDATE projects SET deleted_at
		expect(sql).toContain("deleted_at");
		expect(params).toContain("proj-1");
	});

	it("deleteProject cascades: removes task_tags, soft-deletes tags, then soft-deletes project", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteProject("proj-1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls).toHaveLength(3);
		expect(calls[0][0]).toContain("DELETE FROM task_tags");
		expect(calls[0][1]).toContain("proj-1");
		expect(calls[1][0]).toContain("UPDATE tags SET deleted_at");
		expect(calls[1][1]).toContain("proj-1");
		expect(calls[2][0]).toContain("UPDATE projects SET deleted_at");
		expect(calls[2][1]).toContain("proj-1");
	});

	it("updateProject updates specified fields and sets updated_at", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([
				{
					id: "p1",
					name: "Updated",
					color: null,
					icon: null,
					sort_order: 0,
					created_at: "2026-04-10T10:00:00.000Z",
					updated_at: "2026-04-10T11:00:00.000Z",
				},
			]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateProject("p1", { name: "Updated" });
		const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("name = ?");
		expect(sql).toContain("updated_at = ?");
	});
});

describe("SqliteRepository — tags", () => {
	it("createTag inserts a row and returns a Tag", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([
					{ id: "tag-1", name: "urgent", color: "#f00", project_id: null },
				]),
		});
		const repo = new SqliteRepository(db);
		const tag = await repo.createTag({ name: "urgent", color: "#f00" });
		expect(tag.name).toBe("urgent");
		expect(tag.color).toBe("#f00");
		expect(tag.projectId).toBeNull();
	});

	it("createTag with projectId persists project_id", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([
					{ id: "tag-2", name: "work-tag", color: null, project_id: "proj-1" },
				]),
		});
		const repo = new SqliteRepository(db);
		await repo.createTag({ name: "work-tag", projectId: "proj-1" });
		const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(params).toContain("proj-1");
	});

	it("getTags without argument returns all tags", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ id: "t1", name: "work", color: null, project_id: null }]),
		});
		const repo = new SqliteRepository(db);
		const tags = await repo.getTags();
		expect(tags).toHaveLength(1);
		expect(tags[0].projectId).toBeNull();
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("deleted_at IS NULL");
		expect(sql).not.toContain("AND project_id");
	});

	it("getTags(null) returns only generic tags", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValueOnce([]) });
		const repo = new SqliteRepository(db);
		await repo.getTags(null);
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("project_id IS NULL");
		expect(sql).not.toContain("OR project_id IS NULL");
	});

	it("getTags('proj-1') returns project tags and generic tags", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValueOnce([]) });
		const repo = new SqliteRepository(db);
		await repo.getTags("proj-1");
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("project_id = ?");
		expect(sql).toContain("OR project_id IS NULL");
		expect(params).toContain("proj-1");
	});

	it("getTags returns only non-deleted rows", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ id: "t1", name: "work", color: null, project_id: null }]),
		});
		const repo = new SqliteRepository(db);
		const tags = await repo.getTags();
		expect(tags).toHaveLength(1);
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("deleted_at IS NULL");
	});

	it("deleteTag sets deleted_at (soft delete)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTag("tag-1");
		const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("deleted_at");
		expect(params).toContain("tag-1");
	});

	it("updateTag updates specified fields and sets updated_at", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ id: "t1", name: "urgent", color: "#f00", project_id: null }]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateTag("t1", { color: "#f00" });
		const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("color = ?");
		expect(sql).toContain("updated_at = ?");
	});

	it("updateTag with projectId updates project_id field", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ id: "t1", name: "urgent", color: null, project_id: "proj-1" }]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateTag("t1", { projectId: "proj-1" });
		const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("project_id = ?");
		expect(params).toContain("proj-1");
	});

	it("isTagUsedInProjectTasks returns true when tag is used by a task in a project", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([{ count: 2 }]),
		});
		const repo = new SqliteRepository(db);
		const result = await repo.isTagUsedInProjectTasks("tag-1");
		expect(result).toBe(true);
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("task_tags");
		expect(sql).toContain("project_id IS NOT NULL");
		expect(params).toContain("tag-1");
	});

	it("isTagUsedInProjectTasks returns false when tag has no project tasks", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([{ count: 0 }]),
		});
		const repo = new SqliteRepository(db);
		const result = await repo.isTagUsedInProjectTasks("tag-1");
		expect(result).toBe(false);
	});
});

describe("SqliteRepository — tasks", () => {
	const taskRow: TaskRow = {
		id: "task-1",
		title: "Préparer la démo",
		description: null,
		project_id: "proj-1",
		priority: "high",
		due_date: "2026-04-12",
		completed_at: null,
		deleted_at: null,
		sort_order: 0,
		created_at: "2026-04-10T10:00:00.000Z",
		updated_at: "2026-04-10T10:00:00.000Z",
	};

	it("createTask inserts a task and returns it with empty tags", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([taskRow]) // getTask after insert
				.mockResolvedValueOnce([]), // task_tags join
		});
		const repo = new SqliteRepository(db);
		const task = await repo.createTask({
			title: "Préparer la démo",
			projectId: "proj-1",
			priority: "high",
		});
		expect(task.title).toBe("Préparer la démo");
		expect(task.tags).toEqual([]);
		expect(task.priority).toBe("high");
		expect(db.execute).toHaveBeenCalledOnce();
	});

	it("createTask inserts task_tags rows when tagIds provided", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([taskRow])
				.mockResolvedValueOnce([]),
		});
		const repo = new SqliteRepository(db);
		await repo.createTask({ title: "Task", tagIds: ["tag-1", "tag-2"] });
		// 1 INSERT for task + 2 INSERTs for tags
		expect(db.execute).toHaveBeenCalledTimes(3);
	});

	it("getTasks filters by projectId=null (Inbox)", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ projectId: null });
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("project_id IS NULL");
	});

	it("getTasks filters by specific projectId", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ projectId: "proj-1" });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("project_id = ?");
		expect(params).toContain("proj-1");
	});

	it("getTasks with no filters hides old completed tasks but shows today's", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks();
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("completed_at IS NULL");
		expect(sql).toContain("date('now', 'localtime')");
	});

	it("completeTask sets completed_at", async () => {
		const completedRow = {
			...taskRow,
			completed_at: "2026-04-10T11:00:00.000Z",
		};
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([completedRow])
				.mockResolvedValueOnce([]),
		});
		const repo = new SqliteRepository(db);
		const task = await repo.completeTask("task-1");
		expect(task.completedAt).not.toBeNull();
		const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("completed_at");
	});

	it("deleteTask hard-deletes the task", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTask("task-1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls.some(([sql]: [string]) => sql.includes("DELETE FROM tasks"))).toBe(true);
		expect(calls.some(([_sql, params]: [string, unknown[]]) => params?.includes("task-1"))).toBe(true);
	});

	it("archiveTask sets deleted_at (soft delete)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.archiveTask("task-1");
		const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("deleted_at");
		expect(params).toContain("task-1");
	});

	it("getTasks merges tag data from task_tags join", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([taskRow])
				.mockResolvedValueOnce([
					{ task_id: "task-1", tag_id: "tag-1", name: "urgent", color: "#f00" },
				]),
		});
		const repo = new SqliteRepository(db);
		const tasks = await repo.getTasks();
		expect(tasks[0].tags).toHaveLength(1);
		expect(tasks[0].tags[0].name).toBe("urgent");
	});

	it("uncompleteTask clears completed_at", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ ...taskRow, completed_at: null }])
				.mockResolvedValueOnce([]),
		});
		const repo = new SqliteRepository(db);
		const task = await repo.uncompleteTask("task-1");
		expect(task.completedAt).toBeNull();
		const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("completed_at = NULL");
	});

	it("updateTask replaces tags (DELETE + re-INSERT)", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([taskRow])
				.mockResolvedValueOnce([]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateTask("task-1", { tagIds: ["tag-x", "tag-y"] });
		expect(db.execute).toHaveBeenCalledTimes(4); // 1 UPDATE + 1 DELETE + 2 INSERT
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls[1][0]).toContain("DELETE FROM task_tags");
		expect(calls[2][0]).toContain("INSERT INTO task_tags");
		expect(calls[3][0]).toContain("INSERT INTO task_tags");
	});

	it("getTasks with tagIds filters via INNER JOIN with DISTINCT", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ tagIds: ["tag-1", "tag-2"] });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("INNER JOIN task_tags");
		expect(sql).toContain("DISTINCT");
		expect(params).toContain("tag-1");
		expect(params).toContain("tag-2");
	});

	it("getTasks filters by priority", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ priority: "high" });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("priority = ?");
		expect(params).toContain("high");
	});

	it("getTasks filters by dueBefore", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ dueBefore: "2026-04-15" });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("due_date <= ?");
		expect(params).toContain("2026-04-15");
	});

	it("getTasks with completed:true shows completed tasks", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ completed: true });
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("completed_at IS NOT NULL");
	});
});

describe("SqliteRepository — getTasks filters", () => {
	it("allTasks: true omits the completed_at WHERE condition", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.getTasks({ allTasks: true });
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		// completed_at must still appear in SELECT, but not in a WHERE condition
		expect(sql).not.toContain("completed_at IS NULL");
		expect(sql).not.toContain("completed_at IS NOT NULL");
	});

	it("allTasks absent applies default non-completed WHERE filter", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.getTasks({});
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("completed_at IS NULL");
	});
});

describe("SqliteRepository — settings", () => {
	it("getSettings returns all rows as a key-value record", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([
				{ key: "notification_enabled", value: "true" },
				{ key: "notification_times", value: '[{"hour":10,"minute":0}]' },
			]),
		});
		const repo = new SqliteRepository(db);
		const settings = await repo.getSettings();
		expect(settings).toEqual({
			notification_enabled: "true",
			notification_times: '[{"hour":10,"minute":0}]',
		});
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("FROM settings");
	});

	it("setSetting calls INSERT OR REPLACE with key and value", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.setSetting("notification_enabled", "false");
		expect(db.execute).toHaveBeenCalledWith(
			"INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
			["notification_enabled", "false"],
		);
	});
});
