import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportData } from "@/lib/dataTransfer";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import type { Task } from "@/types";
import type { DbDriver } from "./driver";
import { ALL_MIGRATIONS } from "./migrations/index";
import { runMigrations } from "./migrations/run-migrations";
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

// Fixed so tests asserting on stamp contents don't have to special-case it.
const MOCK_DEVICE_ID = "11111111-1111-1111-1111-111111111111";

function makeDb(overrides: Partial<DbDriver> = {}): DbDriver {
	const baseSelect = vi.fn((query: string) => {
		// Answered here, not via mockResolvedValueOnce, so getOrCreateDeviceId's
		// lookup never consumes a slot a test queued for its own getTask/join call.
		if (query.includes("sync_state")) {
			return Promise.resolve([{ value: MOCK_DEVICE_ID }]);
		}
		return Promise.resolve([]);
	}) as unknown as DbDriver["select"];
	const db: DbDriver = {
		execute: vi.fn().mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 }),
		select: baseSelect,
		// Runs work against this same mock — none of these tests exercise rollback.
		transaction: vi.fn().mockImplementation((work) => work(db)),
		...overrides,
	};
	return db;
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
				.mockResolvedValueOnce([
					{ id: "t1", name: "work", color: null, project_id: null },
				]),
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
				.mockResolvedValueOnce([
					{ id: "t1", name: "work", color: null, project_id: null },
				]),
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
		const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock
			.calls[0];
		expect(sql).toContain("deleted_at");
		expect(params).toContain("tag-1");
	});

	it("updateTag updates specified fields and sets updated_at", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([
					{ id: "t1", name: "urgent", color: "#f00", project_id: null },
				]),
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
				.mockResolvedValueOnce([
					{ id: "t1", name: "urgent", color: null, project_id: "proj-1" },
				]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateTag("t1", { projectId: "proj-1" });
		const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock
			.calls[0];
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId
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

	it("getTasks filters by multiple projectIds via IN clause", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ projectIds: ["proj-1", "proj-2"] });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("t.project_id IN (?, ?)");
		expect(params).toContain("proj-1");
		expect(params).toContain("proj-2");
	});

	it("getTasks projectIds with INBOX_PROJECT_ID maps to project_id IS NULL", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ projectIds: [INBOX_PROJECT_ID] });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("t.project_id IS NULL");
		expect(params).not.toContain(INBOX_PROJECT_ID);
	});

	it("getTasks projectIds mixing Inbox and real projects combines with OR", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ projectIds: ["proj-1", INBOX_PROJECT_ID] });
		const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("(t.project_id IN (?) OR t.project_id IS NULL)");
		expect(params).toEqual(["proj-1"]);
	});

	it("getTasks ignores an empty projectIds array", async () => {
		const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
		const repo = new SqliteRepository(db);
		await repo.getTasks({ projectIds: [] });
		const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).not.toContain("t.project_id IN");
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([completedRow]) // getTask after update
				.mockResolvedValueOnce([]), // task_tags join
		});
		const repo = new SqliteRepository(db);
		const task = await repo.completeTask("task-1");
		expect(task.completedAt).not.toBeNull();
		const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(sql).toContain("completed_at");
	});

	it("deleteTask removes task_tags then tombstones the task (no hard delete)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTask("task-1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		// 3rd call is _stamp's own UPDATE ... SET field_updated_at
		expect(calls).toHaveLength(3);
		expect(calls[0][0]).toContain("DELETE FROM task_tags");
		expect(calls[0][1]).toContain("task-1");
		expect(calls[1][0]).toContain("UPDATE tasks SET purged_at");
		expect(calls[1][1]).toContain("task-1");
	});

	it("archiveTask sets deleted_at (soft delete)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.archiveTask("task-1");
		const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock
			.calls[0];
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([{ ...taskRow, completed_at: null }]) // getTask
				.mockResolvedValueOnce([]), // task_tags join
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
				.mockResolvedValueOnce([{ field_updated_at: null }]) // updateTask's own field_updated_at lookup
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId
				.mockResolvedValueOnce([taskRow]) // getTask after update
				.mockResolvedValueOnce([]), // task_tags join
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

describe("SqliteRepository — field timestamps", () => {
	it("createTask stamps every column it writes", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.createTask({ title: "T" }).catch(() => undefined);
		const insert = (db.execute as ReturnType<typeof vi.fn>).mock.calls.find(
			(c) => String(c[0]).startsWith("INSERT INTO tasks"),
		);
		expect(insert?.[0]).toContain("field_updated_at");
		const json = (insert?.[1] as unknown[]).find(
			(p) => typeof p === "string" && p.startsWith("{"),
		) as string;
		expect(Object.keys(JSON.parse(json))).toContain("title");
	});

	it("updateTask stamps only the patched columns", async () => {
		const db = makeDb({
			select: vi.fn().mockResolvedValue([{ field_updated_at: null }]),
		});
		const repo = new SqliteRepository(db);
		await repo.updateTask("t1", { priority: "high" }).catch(() => undefined);
		const update = (db.execute as ReturnType<typeof vi.fn>).mock.calls.find(
			(c) => String(c[0]).startsWith("UPDATE tasks SET"),
		);
		const json = (update?.[1] as unknown[]).find(
			(p) => typeof p === "string" && p.startsWith("{"),
		) as string;
		const keys = Object.keys(JSON.parse(json));
		expect(keys).toContain("priority");
		expect(keys).not.toContain("title");
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

const sampleExportData: ExportData = {
	version: 1,
	exportedAt: "2026-05-18T10:00:00.000Z",
	projects: [
		{
			id: "p1",
			name: "Work",
			color: "#f00",
			icon: null,
			sortOrder: 0,
			groupId: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	],
	tags: [{ id: "t1", name: "urgent", color: "#0f0", projectId: null }],
	tasks: [
		{
			id: "task1",
			title: "Hello",
			description: null,
			projectId: "p1",
			priority: "high",
			dueDate: null,
			completedAt: null,
			deletedAt: null,
			tags: [{ id: "t1", name: "urgent", color: "#0f0", projectId: null }],
			sortOrder: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	],
};

describe("SqliteRepository — bulkImport", () => {
	it("merge: upserts projects/tasks without DELETE; uses OR IGNORE for tags to protect UNIQUE(name)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(sampleExportData, "merge");

		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => (c[0] as string).trim().toUpperCase(),
		);
		expect(
			calls.some((s: string) => s.startsWith("DELETE FROM PROJECTS")),
		).toBe(false);
		expect(calls.some((s: string) => s.startsWith("DELETE FROM TASKS"))).toBe(
			false,
		);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO PROJECTS")),
		).toBe(true);
		// Tags use OR IGNORE in merge mode to avoid deleting existing tags with conflicting names
		expect(
			calls.some((s: string) => s.includes("INSERT OR IGNORE INTO TAGS")),
		).toBe(true);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TAGS")),
		).toBe(false);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TASKS")),
		).toBe(true);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TASK_TAGS")),
		).toBe(true);
	});

	it("replace: uses OR REPLACE for tags (no name conflict possible after full DELETE)", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(sampleExportData, "replace");

		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => (c[0] as string).trim().toUpperCase(),
		);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO TAGS")),
		).toBe(true);
	});

	it("replace: skips task_tags for tags not in export data", async () => {
		const taskWithExtraTag: Task = {
			...sampleExportData.tasks[0],
			tags: [
				{ id: "tag-1", name: "urgent", color: "#ef4444", projectId: null },
				{
					id: "tag-outside-export",
					name: "other",
					color: "#000",
					projectId: null,
				},
			],
		};
		const dataWithExtraTag: ExportData = {
			...sampleExportData,
			tags: [
				{ id: "tag-1", name: "urgent", color: "#ef4444", projectId: null },
			],
			tasks: [taskWithExtraTag],
		};
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(dataWithExtraTag, "replace");

		const taskTagInserts = (
			db.execute as ReturnType<typeof vi.fn>
		).mock.calls.filter((c: unknown[]) =>
			(c[0] as string)
				.toUpperCase()
				.includes("INSERT OR REPLACE INTO TASK_TAGS"),
		);
		const insertedTagIds = taskTagInserts.map(
			(c: unknown[]) => (c[1] as unknown[])[1],
		);
		expect(insertedTagIds).toContain("tag-1");
		expect(insertedTagIds).not.toContain("tag-outside-export");
	});

	it("merge: deletes existing task_tags for each task before reinserting", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(sampleExportData, "merge");

		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => (c[0] as string).trim().toUpperCase(),
		);
		expect(
			calls.some((s: string) =>
				s.startsWith("DELETE FROM TASK_TAGS WHERE TASK_ID"),
			),
		).toBe(true);
	});

	it("replace: runs DELETE statements before inserting", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(sampleExportData, "replace");

		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => (c[0] as string).trim().toUpperCase(),
		);
		expect(
			calls.some((s: string) => s.startsWith("DELETE FROM TASK_TAGS")),
		).toBe(true);
		expect(calls.some((s: string) => s.startsWith("DELETE FROM TASKS"))).toBe(
			true,
		);
		expect(calls.some((s: string) => s.startsWith("DELETE FROM TAGS"))).toBe(
			true,
		);
		expect(
			calls.some((s: string) => s.startsWith("DELETE FROM PROJECTS")),
		).toBe(true);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO PROJECTS")),
		).toBe(true);
	});

	it("replace: DELETE statements appear before INSERT statements", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(sampleExportData, "replace");

		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => (c[0] as string).trim().toUpperCase(),
		);
		const firstDeleteIdx = calls.findIndex((s: string) =>
			s.startsWith("DELETE FROM"),
		);
		const firstInsertIdx = calls.findIndex((s: string) =>
			s.includes("INSERT OR REPLACE"),
		);
		expect(firstDeleteIdx).toBeLessThan(firstInsertIdx);
	});
});

describe("SqliteRepository — purge", () => {
	it("deleteTask writes a tombstone instead of removing the row", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTask("t1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls.some((c) => String(c[0]).includes("DELETE FROM tasks"))).toBe(
			false,
		);
		const purge = calls.find((c) => String(c[0]).includes("purged_at"));
		expect(purge).toBeDefined();
		expect(purge?.[1]).toContain("t1");
	});

	it("deleteTask clears content so the tombstone leaks nothing", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteTask("t1");
		const purge = (db.execute as ReturnType<typeof vi.fn>).mock.calls.find(
			(c) => String(c[0]).includes("purged_at"),
		);
		expect(String(purge?.[0])).toContain("title = ''");
		expect(String(purge?.[0])).toContain("description = NULL");
	});

	it("getTasks filters out purged rows", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.getTasks();
		const select = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(String(select[0])).toContain("purged_at IS NULL");
	});
});

describe("SqliteRepository — project groups", () => {
	it("createProjectGroup inserts a row and returns a ProjectGroup", async () => {
		const now = "2026-06-18T10:00:00.000Z";
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ max_order: null }]) // MAX(sort_order) query
				.mockResolvedValueOnce([
					{
						id: "grp-1",
						name: "Perso",
						color: "#6366f1",
						sort_order: 0,
						created_at: now,
						updated_at: now,
					},
				]),
		});
		const repo = new SqliteRepository(db);
		const group = await repo.createProjectGroup({
			name: "Perso",
			color: "#6366f1",
		});
		expect(group.name).toBe("Perso");
		expect(group.color).toBe("#6366f1");
		expect(typeof group.id).toBe("string");
		expect(db.execute).toHaveBeenCalledOnce();
	});

	it("getProjectGroups returns mapped ProjectGroup[]", async () => {
		const now = "2026-06-18T10:00:00.000Z";
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([
				{
					id: "g1",
					name: "Work",
					color: "#3b82f6",
					sort_order: 0,
					created_at: now,
					updated_at: now,
				},
				{
					id: "g2",
					name: "Perso",
					color: "#22c55e",
					sort_order: 1,
					created_at: now,
					updated_at: now,
				},
			]),
		});
		const repo = new SqliteRepository(db);
		const groups = await repo.getProjectGroups();
		expect(groups).toHaveLength(2);
		expect(groups[0].name).toBe("Work");
		expect(groups[1].sortOrder).toBe(1);
	});

	it("deleteProjectGroup executes a DELETE", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.deleteProjectGroup("grp-1");
		expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [
			"grp-1",
		]);
	});

	it("reorderProjects updates sort_order for each id", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.reorderProjects(["p3", "p1", "p2"]);
		expect(db.execute).toHaveBeenCalledTimes(3);
		expect(db.execute).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("UPDATE projects"),
			expect.arrayContaining([0, "p3"]),
		);
		expect(db.execute).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining("UPDATE projects"),
			expect.arrayContaining([1, "p1"]),
		);
	});

	it("assignProjectToGroup sets group_id on a project", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.assignProjectToGroup("proj-1", "grp-1");
		expect(db.execute).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE projects"),
			expect.arrayContaining(["grp-1", "proj-1"]),
		);
	});

	it("assignProjectToGroup with null clears group_id", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.assignProjectToGroup("proj-1", null);
		expect(db.execute).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE projects"),
			expect.arrayContaining([null, "proj-1"]),
		);
	});

	it("updateProjectGroup updates name and returns updated group", async () => {
		const now = "2026-06-18T10:00:00.000Z";
		const db = makeDb({
			select: vi.fn().mockResolvedValueOnce([
				{
					id: "grp-1",
					name: "Updated",
					color: "#3b82f6",
					sort_order: 0,
					created_at: now,
					updated_at: now,
				},
			]),
		});
		const repo = new SqliteRepository(db);
		const updated = await repo.updateProjectGroup("grp-1", { name: "Updated" });
		expect(updated.name).toBe("Updated");
		expect(db.execute).toHaveBeenCalledOnce();
		const call = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toContain("UPDATE project_groups");
		expect(call[1]).toContain("grp-1");
	});
});

describe("SqliteRepository — reorder", () => {
	it("writes both sort_key and sort_order during the transition release", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.reorderTasks(["a", "b", "c"]);
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls).toHaveLength(3);
		expect(String(calls[0][0])).toContain("sort_key = ?");
		expect(String(calls[0][0])).toContain("sort_order = ?");
	});

	it("assigns strictly increasing sort_key values", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.reorderTasks(["a", "b", "c"]);
		const keys = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c) => (c[1] as unknown[])[0] as string,
		);
		expect(keys).toEqual([...keys].sort());
		expect(new Set(keys).size).toBe(3);
	});
});

describe("field stamping beyond updateTask", () => {
	// A merge engine built on the original claim that updateTask was the only
	// write path would never see an archive, a completion or a move as a field
	// change — the remote value would win forever.
	async function stampsOf(
		_repo: SqliteRepository,
		db: BetterSqliteDriver,
		id: string,
	) {
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[id],
		);
		return JSON.parse(rows[0]?.field_updated_at ?? "{}") as Record<
			string,
			{ t: string; d: string }
		>;
	}

	let db: BetterSqliteDriver;
	let repo: SqliteRepository;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		repo = new SqliteRepository(db);
	});

	afterEach(() => db?.close());

	it("archiveTask stamps deleted_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.archiveTask(task.id);
		expect((await stampsOf(repo, db, task.id)).deleted_at).toBeDefined();
	});

	it("unarchiveTask stamps deleted_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.archiveTask(task.id);
		const before = (await stampsOf(repo, db, task.id)).deleted_at.t;
		// Real-clock stamps: without a tick, two calls this close together can
		// land in the same millisecond and produce an identical `t`.
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.unarchiveTask(task.id);
		expect((await stampsOf(repo, db, task.id)).deleted_at.t).not.toBe(before);
	});

	it("completeTask stamps completed_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.completeTask(task.id);
		expect((await stampsOf(repo, db, task.id)).completed_at).toBeDefined();
	});

	it("uncompleteTask stamps completed_at", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.completeTask(task.id);
		// completeTask already stamped completed_at, so presence alone would hold
		// even if uncompleteTask stamped nothing — only a changed `t` proves it.
		const before = (await stampsOf(repo, db, task.id)).completed_at.t;
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.uncompleteTask(task.id);
		expect((await stampsOf(repo, db, task.id)).completed_at.t).not.toBe(before);
	});

	it("moveTasksToProject stamps project_id on every task moved", async () => {
		const a = await repo.createTask({ title: "a" });
		const b = await repo.createTask({ title: "b" });
		const project = await repo.createProject({ name: "p" });
		// createTask already stamps project_id, so asserting presence would pass
		// against an unstamped move — capture the creation stamp and require it
		// to move.
		const beforeA = (await stampsOf(repo, db, a.id)).project_id.t;
		const beforeB = (await stampsOf(repo, db, b.id)).project_id.t;
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.moveTasksToProject([a.id, b.id], project.id);
		const afterA = (await stampsOf(repo, db, a.id)).project_id;
		const afterB = (await stampsOf(repo, db, b.id)).project_id;
		expect(afterA.t).not.toBe(beforeA);
		expect(afterB.t).not.toBe(beforeB);
		expect(afterA.d).toMatch(/^[0-9a-f-]{36}$/);
		expect(afterB.d).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("deleteTask stamps the columns its tombstone writes", async () => {
		const task = await repo.createTask({ title: "x" });
		// createTask stamps title too, so only a changed `t` shows the tombstone
		// registered blanking it as a field change of its own.
		const beforeTitle = (await stampsOf(repo, db, task.id)).title.t;
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.deleteTask(task.id);
		const stamps = await stampsOf(repo, db, task.id);
		// purged_at is what tells another device this row is gone; without a
		// stamp the tombstone loses every tie against a stale live copy.
		expect(stamps.purged_at).toBeDefined();
		expect(stamps.deleted_at).toBeDefined();
		expect(stamps.title.t).not.toBe(beforeTitle);
	});

	it("stamps carry the real device id, not the placeholder", async () => {
		const task = await repo.createTask({ title: "x" });
		await repo.archiveTask(task.id);
		const stamps = await stampsOf(repo, db, task.id);
		expect(stamps.deleted_at.d).not.toBe("local");
		expect(stamps.deleted_at.d).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("rolls the column write back when the stamp fails", async () => {
		const task = await repo.createTask({ title: "x" });
		// The stamp is a second statement after the column write. If it fails and
		// the column write survives, the row is archived with no record that
		// deleted_at ever changed — invisible to the merge engine, which is the
		// exact failure this task exists to prevent.
		db.failNextExecuteMatching(/SET field_updated_at/);
		await expect(repo.archiveTask(task.id)).rejects.toThrow();
		const rows = await db.select<{ deleted_at: string | null }>(
			"SELECT deleted_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0]?.deleted_at).toBeNull();
	});
});
