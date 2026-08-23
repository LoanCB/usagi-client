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
			select: vi
				.fn()
				.mockResolvedValueOnce([]) // _headKey — no existing rows
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{
						id: "proj-1",
						name: "Boulot",
						color: "#6366f1",
						icon: "💼",
						sort_order: 0,
						created_at: "2026-04-10T10:00:00.000Z",
						updated_at: "2026-04-10T10:00:00.000Z",
					},
				]), // _getProject after insert
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
		// INSERT + the stamp's own UPDATE ... SET field_updated_at
		expect(db.execute).toHaveBeenCalledTimes(2);
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
		// No tags under this project, so the cascade's per-tag stamping loop is a
		// no-op — isolates this test to the write ordering, not the cascade stamp.
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([]) // tags under this project (none)
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]), // _stamp's prior lookup
		});
		const repo = new SqliteRepository(db);
		await repo.deleteProject("proj-1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls[0][0]).toContain("DELETE FROM task_tags");
		expect(calls[0][1]).toContain("proj-1");
		expect(calls[1][0]).toContain("UPDATE tags SET deleted_at");
		expect(calls[1][1]).toContain("proj-1");
		const projectUpdate = calls.find((c) =>
			String(c[0]).startsWith("UPDATE projects SET deleted_at"),
		);
		expect(projectUpdate?.[1]).toContain("proj-1");
	});

	it("updateProject updates specified fields and sets updated_at", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{
						id: "p1",
						name: "Updated",
						color: null,
						icon: null,
						sort_order: 0,
						created_at: "2026-04-10T10:00:00.000Z",
						updated_at: "2026-04-10T11:00:00.000Z",
					},
				]), // _getProject after update
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{ id: "tag-1", name: "urgent", color: "#f00", project_id: null },
				]), // _getTag after insert
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{ id: "tag-2", name: "work-tag", color: null, project_id: "proj-1" },
				]), // _getTag after insert
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{ id: "t1", name: "urgent", color: "#f00", project_id: null },
				]), // _getTag after update
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
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{ id: "t1", name: "urgent", color: null, project_id: "proj-1" },
				]), // _getTag after update
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
				.mockResolvedValueOnce([]) // _headKey — no existing rows
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
				.mockResolvedValueOnce([]) // _headKey — no existing rows
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
				.mockResolvedValueOnce([]) // _headKey — no existing rows
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{
						id: "grp-1",
						name: "Perso",
						color: "#6366f1",
						sort_order: 0,
						created_at: now,
						updated_at: now,
					},
				]), // _getProjectGroup after insert
		});
		const repo = new SqliteRepository(db);
		const group = await repo.createProjectGroup({
			name: "Perso",
			color: "#6366f1",
		});
		expect(group.name).toBe("Perso");
		expect(group.color).toBe("#6366f1");
		expect(typeof group.id).toBe("string");
		// INSERT + the stamp's own UPDATE ... SET field_updated_at
		expect(db.execute).toHaveBeenCalledTimes(2);
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
			select: vi
				.fn()
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{
						id: "grp-1",
						name: "Updated",
						color: "#3b82f6",
						sort_order: 0,
						created_at: now,
						updated_at: now,
					},
				]), // _getProjectGroup after update
		});
		const repo = new SqliteRepository(db);
		const updated = await repo.updateProjectGroup("grp-1", { name: "Updated" });
		expect(updated.name).toBe("Updated");
		// UPDATE + the stamp's own UPDATE ... SET field_updated_at
		expect(db.execute).toHaveBeenCalledTimes(2);
		const call = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toContain("UPDATE project_groups");
		expect(call[1]).toContain("grp-1");
	});
});

describe("moveTask", () => {
	// Real SQLite, not the mock db: the "one row" and "leaves other rows
	// untouched" assertions need genuine ORDER BY sort_key behaviour, which a
	// mocked select/execute pair cannot fake convincingly.
	let db: BetterSqliteDriver;
	let repo: SqliteRepository;

	async function seedThree(): Promise<[Task, Task, Task]> {
		const a = await repo.createTask({ title: "a" });
		const b = await repo.createTask({ title: "b" });
		const c = await repo.createTask({ title: "c" });
		// createTask prepends: undo that so the seed order is a, b, c.
		await repo.moveTask(b.id, a.id, null);
		await repo.moveTask(c.id, b.id, null);
		return [a, b, c];
	}

	async function seedTwo(): Promise<[Task, Task]> {
		const a = await repo.createTask({ title: "a" });
		const b = await repo.createTask({ title: "b" });
		await repo.moveTask(b.id, a.id, null);
		return [a, b];
	}

	async function orderedIds(): Promise<string[]> {
		const rows = await db.select<{ id: string }>(
			"SELECT id FROM tasks ORDER BY sort_key",
		);
		return rows.map((r) => r.id);
	}

	async function keyOf(id: string): Promise<string | null> {
		const rows = await db.select<{ sort_key: string | null }>(
			"SELECT sort_key FROM tasks WHERE id = ?",
			[id],
		);
		return rows[0]?.sort_key ?? null;
	}

	async function stampsOf(
		id: string,
	): Promise<Record<string, { t: string; d: string }>> {
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[id],
		);
		return JSON.parse(rows[0]?.field_updated_at ?? "{}");
	}

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		repo = new SqliteRepository(db);
	});

	afterEach(() => db?.close());

	it("writes exactly one row", async () => {
		const [a, b, c] = await seedThree();
		const writes = db.countWrites();
		await repo.moveTask(c.id, a.id, b.id);
		expect(db.countWrites() - writes).toBe(2); // the move, plus its stamp
	});

	it("places the task between its two neighbours", async () => {
		const [a, b, c] = await seedThree();
		await repo.moveTask(c.id, a.id, b.id);
		const order = await orderedIds();
		expect(order).toEqual([a.id, c.id, b.id]);
	});

	it("moves to the very top when there is no previous neighbour", async () => {
		const [a, b, c] = await seedThree();
		await repo.moveTask(c.id, null, a.id);
		expect(await orderedIds()).toEqual([c.id, a.id, b.id]);
	});

	it("moves to the very bottom when there is no next neighbour", async () => {
		const [a, b, c] = await seedThree();
		await repo.moveTask(a.id, c.id, null);
		expect(await orderedIds()).toEqual([b.id, c.id, a.id]);
	});

	it("leaves rows outside the move untouched", async () => {
		// The bug this replaces: reordering a filtered subset renumbered it
		// 0..N-1 and collided with every row the view did not show.
		const [a, b, c] = await seedThree();
		const hidden = await repo.createTask({ title: "hidden" });
		const before = await keyOf(hidden.id);
		await repo.moveTask(c.id, a.id, b.id);
		expect(await keyOf(hidden.id)).toBe(before);
	});

	it("keeps a hidden row between the two visible neighbours it sat between", async () => {
		// Dropping between two *visible* tasks places the moved task among any
		// hidden rows that lie between them. That is the documented meaning of a
		// global order under a filtered view, not a defect.
		const [a, b] = await seedTwo();
		const hidden = await repo.createTask({ title: "hidden" });
		await repo.moveTask(hidden.id, a.id, b.id);
		const moved = await repo.createTask({ title: "moved" });
		await repo.moveTask(moved.id, a.id, b.id);
		const order = await orderedIds();
		expect(order.indexOf(moved.id)).toBeGreaterThan(order.indexOf(a.id));
		expect(order.indexOf(moved.id)).toBeLessThan(order.indexOf(b.id));
	});

	it("stamps sort_key on the moved row", async () => {
		// createTask already stamps sort_key at insert, so presence alone would
		// pass even if moveTask never re-stamped it — only a changed `t` proves
		// this write touched it.
		const [a, b, c] = await seedThree();
		const before = (await stampsOf(c.id)).sort_key.t;
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.moveTask(c.id, a.id, b.id);
		expect((await stampsOf(c.id)).sort_key.t).not.toBe(before);
	});

	it("still reorders projects once getProjects reads sort_key", async () => {
		// The regression this guards: reorderProjects only ever wrote sort_order.
		// Switching the read to sort_key without converting the write makes the
		// sidebar reorder a no-op that leaves no trace.
		//
		// createProject already places new rows at the head, so a naive version of
		// this test (create a, then b, then move b before a) would pass even if
		// moveProject wrote nothing at all — b already sorts first from creation.
		// Moving a in front of b instead requires the write to actually land.
		const a = await repo.createProject({ name: "a" });
		const b = await repo.createProject({ name: "b" });
		expect((await repo.getProjects()).map((p) => p.id)).toEqual([b.id, a.id]);
		await repo.moveProject(a.id, null, b.id);
		expect((await repo.getProjects()).map((p) => p.id)).toEqual([a.id, b.id]);
	});

	it("still reorders project groups once getProjectGroups reads sort_key", async () => {
		// Same trap as the project test above: move the row that creation order
		// already agrees with, and the assertion would hold even against a
		// moveProjectGroup that writes nothing.
		const a = await repo.createProjectGroup({ name: "a", color: "#000" });
		const b = await repo.createProjectGroup({ name: "b", color: "#000" });
		expect((await repo.getProjectGroups()).map((g) => g.id)).toEqual([
			b.id,
			a.id,
		]);
		await repo.moveProjectGroup(a.id, null, b.id);
		expect((await repo.getProjectGroups()).map((g) => g.id)).toEqual([
			a.id,
			b.id,
		]);
	});

	it("getTasks reflects moveTask through the same read path the UI uses", async () => {
		// The other tests in this suite read order back with a raw ORDER BY
		// sort_key query; this one goes through getTasks itself, so a getTasks
		// left on ORDER BY sort_order would show up as a failure here even though
		// the raw-SQL assertions above would not notice.
		const [a, b, c] = await seedThree();
		await repo.moveTask(c.id, a.id, b.id);
		expect((await repo.getTasks()).map((t) => t.id)).toEqual([
			a.id,
			c.id,
			b.id,
		]);
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

describe("sort_key at insert", () => {
	let db: BetterSqliteDriver;
	let repo: SqliteRepository;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		repo = new SqliteRepository(db);
	});

	afterEach(() => db?.close());

	it("gives a new task a key without waiting for a restart", async () => {
		const task = await repo.createTask({ title: "x" });
		const rows = await db.select<{ sort_key: string | null }>(
			"SELECT sort_key FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].sort_key).not.toBeNull();
	});

	it("places a new task at the top, matching where the UI shows it", async () => {
		// The optimistic store prepends a new task; the persisted order must
		// agree, or the task jumps on the next reload.
		const first = await repo.createTask({ title: "first" });
		const second = await repo.createTask({ title: "second" });
		const rows = await db.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
	});

	it("gives each new task a distinct key", async () => {
		const a = await repo.createTask({ title: "a" });
		const b = await repo.createTask({ title: "b" });
		const rows = await db.select<{ sort_key: string }>(
			"SELECT sort_key FROM tasks WHERE id IN (?, ?)",
			[a.id, b.id],
		);
		expect(new Set(rows.map((r) => r.sort_key)).size).toBe(2);
	});

	it("stamps sort_key as a field", async () => {
		const task = await repo.createTask({ title: "x" });
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[task.id],
		);
		const stamps = JSON.parse(rows[0]?.field_updated_at ?? "{}") as Record<
			string,
			{ t: string; d: string }
		>;
		expect(stamps.sort_key).toBeDefined();
	});

	it("places a new project at the top of its ordering", async () => {
		const first = await repo.createProject({ name: "first" });
		const second = await repo.createProject({ name: "second" });
		const rows = await db.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM projects ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
	});

	it("places a new project group at the top of its ordering", async () => {
		const first = await repo.createProjectGroup({
			name: "first",
			color: "#000",
		});
		const second = await repo.createProjectGroup({
			name: "second",
			color: "#000",
		});
		const rows = await db.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM project_groups ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
	});
});

describe("field stamping — projects, tags, project groups", () => {
	// Same failure mode as tasks: a write path that skips _stamp leaves
	// field_updated_at NULL, so a merge engine has nothing to compare and the
	// remote value wins by default — the local edit silently reverts.
	async function stampsOf(
		db: BetterSqliteDriver,
		table: "projects" | "tags" | "project_groups",
		id: string,
	) {
		const rows = await db.select<{ field_updated_at: string | null }>(
			`SELECT field_updated_at FROM ${table} WHERE id = ?`,
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

	it("createProject stamps the fields it writes", async () => {
		const project = await repo.createProject({
			name: "p",
			color: "#fff",
			icon: "🏠",
		});
		const stamps = await stampsOf(db, "projects", project.id);
		expect(stamps.name).toBeDefined();
		expect(stamps.color).toBeDefined();
		expect(stamps.icon).toBeDefined();
		expect(stamps.name.d).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("updateProject stamps only the fields in the patch", async () => {
		// createProject already stamps name, color and icon regardless of which
		// were passed in, so presence on `color` would pass even if update never
		// re-stamped it — only a changed `t` proves this write touched it.
		const project = await repo.createProject({ name: "p" });
		const before = await stampsOf(db, "projects", project.id);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.updateProject(project.id, { color: "#fff" });
		const after = await stampsOf(db, "projects", project.id);
		expect(after.color.t).not.toBe(before.color.t);
		// An untouched field keeps its old stamp: re-stamping everything on every
		// write would make the last writer win the whole row, not the field.
		expect(after.name.t).toBe(before.name.t);
	});

	it("deleteProject stamps deleted_at on the project", async () => {
		const project = await repo.createProject({ name: "p" });
		await repo.deleteProject(project.id);
		const stamps = await stampsOf(db, "projects", project.id);
		expect(stamps.deleted_at).toBeDefined();
	});

	it("assignProjectToGroup stamps group_id", async () => {
		const project = await repo.createProject({ name: "p" });
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		// createProject never touches group_id, so presence alone is a genuine
		// assertion here — there is no prior stamp it could be confused with.
		await repo.assignProjectToGroup(project.id, group.id);
		const stamps = await stampsOf(db, "projects", project.id);
		expect(stamps.group_id).toBeDefined();
	});

	it("deleteProject stamps the cascaded tag deletions too", async () => {
		const project = await repo.createProject({ name: "p" });
		const tag = await repo.createTag({ name: "t", projectId: project.id });
		// createTag already stamps deleted_at? No — creation never touches
		// deleted_at, so presence alone is a genuine assertion here.
		await repo.deleteProject(project.id);
		// The cascade writes deleted_at on the tag; unstamped, the tag would come
		// back the moment another device pushed its own stale copy.
		const stamps = await stampsOf(db, "tags", tag.id);
		expect(stamps.deleted_at).toBeDefined();
	});

	it("createProjectGroup stamps the fields it writes", async () => {
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		const stamps = await stampsOf(db, "project_groups", group.id);
		expect(stamps.name).toBeDefined();
		expect(stamps.color).toBeDefined();
		expect(stamps.name.d).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("updateProjectGroup stamps only the fields in the patch", async () => {
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		const before = await stampsOf(db, "project_groups", group.id);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.updateProjectGroup(group.id, { name: "g2" });
		const after = await stampsOf(db, "project_groups", group.id);
		expect(after.name).toBeDefined();
		expect(after.name.t).not.toBe(before.name.t);
		// color was not in the patch — its stamp must not move.
		expect(after.color.t).toBe(before.color.t);
	});

	it("createTag stamps the fields it writes", async () => {
		const tag = await repo.createTag({ name: "t", color: "#abc" });
		const stamps = await stampsOf(db, "tags", tag.id);
		expect(stamps.name).toBeDefined();
		expect(stamps.color).toBeDefined();
		expect(stamps.project_id).toBeDefined();
		expect(stamps.name.d).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("updateTag stamps only the fields in the patch", async () => {
		const tag = await repo.createTag({ name: "t", color: "#abc" });
		const before = await stampsOf(db, "tags", tag.id);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.updateTag(tag.id, { color: "#def" });
		const after = await stampsOf(db, "tags", tag.id);
		expect(after.color.t).not.toBe(before.color.t);
		// name was not in the patch — its stamp must not move.
		expect(after.name.t).toBe(before.name.t);
	});

	it("deleteTag stamps deleted_at", async () => {
		const tag = await repo.createTag({ name: "t" });
		// createTag never touches deleted_at, so presence alone is a genuine
		// assertion here — there is no prior stamp it could be confused with.
		await repo.deleteTag(tag.id);
		const stamps = await stampsOf(db, "tags", tag.id);
		expect(stamps.deleted_at).toBeDefined();
	});
});
