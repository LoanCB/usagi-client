import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportData } from "@/lib/dataTransfer";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import type { Project, Tag, Task } from "@/types";
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
						sort_key: "a0",
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
					sort_key: "a0",
					created_at: "2026-04-10T10:00:00.000Z",
					updated_at: "2026-04-10T10:00:00.000Z",
				},
				{
					id: "p2",
					name: "B",
					color: "#f00",
					icon: "🚀",
					sort_order: 1,
					sort_key: "a1",
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
						sort_key: "a0",
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
			sortKey: "a0",
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
		// Which task_tags rows get written depends on which tags the table
		// actually holds, so it is asserted against real SQLite instead — see
		// "bulkImport — references the payload names but this device lacks".
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

	it("replace: physically deletes task_tags but tombstones tasks/tags/projects", async () => {
		// task_tags carries no sync identity of its own (spec §1.5) so it stays a
		// physical delete; tasks/tags/projects must not, or the tombstone never
		// reaches the other devices — the whole point of a replace import.
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
			false,
		);
		expect(calls.some((s: string) => s.startsWith("DELETE FROM TAGS"))).toBe(
			false,
		);
		expect(
			calls.some((s: string) => s.startsWith("DELETE FROM PROJECTS")),
		).toBe(false);
		expect(
			calls.some((s: string) => s.includes("INSERT OR REPLACE INTO PROJECTS")),
		).toBe(true);
	});

	it("replace: task_tags DELETE runs before the inserts", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.bulkImport(sampleExportData, "replace");

		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => (c[0] as string).trim().toUpperCase(),
		);
		const deleteIdx = calls.findIndex((s: string) =>
			s.startsWith("DELETE FROM TASK_TAGS"),
		);
		const firstInsertIdx = calls.findIndex((s: string) =>
			s.includes("INSERT OR REPLACE"),
		);
		expect(deleteIdx).toBeLessThan(firstInsertIdx);
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
				.mockResolvedValueOnce([]) // _headKey — no existing rows in the shared key space
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]) // _stamp's prior lookup
				.mockResolvedValueOnce([
					{
						id: "grp-1",
						name: "Perso",
						color: "#6366f1",
						sort_order: 0,
						sort_key: "a0",
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
					sort_key: "a0",
					created_at: now,
					updated_at: now,
				},
				{
					id: "g2",
					name: "Perso",
					color: "#22c55e",
					sort_order: 1,
					sort_key: "a1",
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

	it("deleteProjectGroup tombstones the row instead of deleting it", async () => {
		const db = makeDb({
			select: vi
				.fn()
				.mockResolvedValueOnce([]) // detached projects lookup
				.mockResolvedValueOnce([{ value: MOCK_DEVICE_ID }]) // getOrCreateDeviceId in _stamp
				.mockResolvedValueOnce([{ field_updated_at: null }]), // _stamp's prior lookup
		});
		const repo = new SqliteRepository(db);
		await repo.deleteProjectGroup("grp-1");
		const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
		expect(
			calls.some((c) => String(c[0]).includes("DELETE FROM project_groups")),
		).toBe(false);
		const purge = calls.find((c) => String(c[0]).includes("purged_at"));
		expect(purge).toBeDefined();
		expect(purge?.[1]).toContain("grp-1");
	});

	it("getProjectGroups filters out purged rows", async () => {
		const db = makeDb();
		const repo = new SqliteRepository(db);
		await repo.getProjectGroups();
		const select = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(String(select[0])).toContain("purged_at IS NULL");
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
						sort_key: "a0",
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

describe("SqliteRepository — deleteProjectGroup tombstone", () => {
	// Real SQLite: these pin what the rows actually do after the delete, not
	// just the shape of the statements — the mocked suite above already covers
	// that. purged_at survival, the detach cascade, and the rollback on a
	// mid-transaction failure all need genuine row state.
	async function groupStampsOf(db: BetterSqliteDriver, id: string) {
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM project_groups WHERE id = ?",
			[id],
		);
		return JSON.parse(rows[0]?.field_updated_at ?? "{}") as Record<
			string,
			{ t: string; d: string }
		>;
	}

	async function projectStampsOf(db: BetterSqliteDriver, id: string) {
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM projects WHERE id = ?",
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

	it("tombstones the group instead of deleting the row", async () => {
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		await repo.deleteProjectGroup(group.id);
		const rows = await db.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM project_groups WHERE id = ?",
			[group.id],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].purged_at).not.toBeNull();
	});

	it("detaches the projects that belonged to it", async () => {
		// Without this the projects keep a group_id pointing at a row no reader
		// can resolve, and the sidebar renders them under a group that is gone.
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		const project = await repo.createProject({ name: "p" });
		await repo.assignProjectToGroup(project.id, group.id);
		await repo.deleteProjectGroup(group.id);
		const rows = await db.select<{ group_id: string | null }>(
			"SELECT group_id FROM projects WHERE id = ?",
			[project.id],
		);
		expect(rows[0].group_id).toBeNull();
	});

	it("stamps both the tombstone and the detached projects", async () => {
		// assignProjectToGroup already stamps group_id, so presence alone would
		// pass even if the delete's own detach never re-stamped it — only a
		// changed `t` proves this write touched it.
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		const project = await repo.createProject({ name: "p" });
		await repo.assignProjectToGroup(project.id, group.id);
		const before = (await projectStampsOf(db, project.id)).group_id.t;
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.deleteProjectGroup(group.id);
		expect((await groupStampsOf(db, group.id)).purged_at).toBeDefined();
		const after = await projectStampsOf(db, project.id);
		expect(after.group_id).toBeDefined();
		expect(after.group_id.t).not.toBe(before);
	});

	it("hides the tombstoned group from getProjectGroups while the row survives", async () => {
		// The empty list alone would also hold for a physical DELETE, which is
		// the exact regression this task fixes — pin survival too, so only the
		// purged_at filter (not the row's absence) explains the empty list.
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		await repo.deleteProjectGroup(group.id);
		expect(await repo.getProjectGroups()).toEqual([]);
		const rows = await db.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM project_groups WHERE id = ?",
			[group.id],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].purged_at).not.toBeNull();
	});

	it("applies the tombstone and the detach atomically", async () => {
		// Half of this pair is worse than neither: a tombstoned group whose
		// projects still point at it renders an unresolvable reference.
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		const project = await repo.createProject({ name: "p" });
		await repo.assignProjectToGroup(project.id, group.id);
		db.failNextExecuteMatching(/UPDATE projects SET group_id = NULL/);
		await expect(repo.deleteProjectGroup(group.id)).rejects.toThrow();
		const rows = await db.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM project_groups WHERE id = ?",
			[group.id],
		);
		expect(rows[0].purged_at).toBeNull();
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

	it("keys a project between two groups from one shared space", async () => {
		// The sidebar's top level interleaves groups and standalone projects, so
		// their keys have to be comparable. With one key space per table the two
		// group neighbours resolve to null, the moved project lands on the head
		// key of the projects table, and the merged list loses its ordering source.
		const g1 = await repo.createProjectGroup({ name: "g1", color: "#000" });
		const g2 = await repo.createProjectGroup({ name: "g2", color: "#000" });
		const p = await repo.createProject({ name: "p" });
		await repo.moveProject(p.id, g2.id, g1.id);

		const keyOfRow = async (table: string, id: string) => {
			const rows = await db.select<{ sort_key: string }>(
				`SELECT sort_key FROM ${table} WHERE id = ?`,
				[id],
			);
			return rows[0].sort_key;
		};
		const keyG1 = await keyOfRow("project_groups", g1.id);
		const keyG2 = await keyOfRow("project_groups", g2.id);
		const keyP = await keyOfRow("projects", p.id);
		expect(keyG2 < keyP).toBe(true);
		expect(keyP < keyG1).toBe(true);
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

describe("bulkImport under sync", () => {
	// An import is a bulk local edit that propagates: every row it writes gets
	// stamped as changed now, by this device, so the outbox pushes it like any
	// other write. Real SQLite throughout — the tombstone survival, the stamp
	// contents and the atomicity all need genuine row state.
	function exportWith(
		tasks: Array<Partial<Task> & { id: string; title: string }>,
	): ExportData {
		return {
			version: 1,
			exportedAt: "2020-01-01T00:00:00.000Z",
			projects: [],
			tags: [],
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				description: t.description ?? null,
				projectId: t.projectId ?? null,
				priority: t.priority ?? "none",
				dueDate: t.dueDate ?? null,
				completedAt: t.completedAt ?? null,
				deletedAt: t.deletedAt ?? null,
				tags: t.tags ?? [],
				sortOrder: t.sortOrder ?? 0,
				createdAt: t.createdAt ?? "2020-01-01T00:00:00.000Z",
				updatedAt: t.updatedAt ?? "2020-01-01T00:00:00.000Z",
			})),
		};
	}

	async function stampsOf(
		db: BetterSqliteDriver,
		id: string,
	): Promise<Record<string, { t: string; d: string }>> {
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[id],
		);
		return JSON.parse(rows[0]?.field_updated_at ?? "{}");
	}

	let db: BetterSqliteDriver;
	let repo: SqliteRepository;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		repo = new SqliteRepository(db);
	});

	afterEach(() => db?.close());

	it("stamps every imported row", async () => {
		await repo.bulkImport(exportWith([{ id: "t1", title: "x" }]), "merge");
		expect((await stampsOf(db, "t1")).title).toBeDefined();
	});

	it("does not leave field_updated_at null on a colliding row", async () => {
		// INSERT OR REPLACE is a DELETE-then-INSERT in SQLite, so a colliding row
		// used to lose its stamps, its tombstone and its key in merge mode too —
		// merge was never the gentler option it looked like.
		const task = await repo.createTask({ title: "original" });
		await repo.bulkImport(
			exportWith([{ id: task.id, title: "imported" }]),
			"merge",
		);
		const stamps = await stampsOf(db, task.id);
		expect(Object.keys(stamps).length).toBeGreaterThan(0);
	});

	it("preserves sort_key on imported rows", async () => {
		await repo.bulkImport(exportWith([{ id: "t1", title: "x" }]), "merge");
		const rows = await db.select<{ sort_key: string | null }>(
			"SELECT sort_key FROM tasks WHERE id = 't1'",
		);
		expect(rows[0].sort_key).not.toBeNull();
	});

	it("tombstones local rows absent from a replace import", async () => {
		// A row that was merely deleted (not tombstoned) is also "not null" by
		// Map.get's undefined — so the row's continued existence has to be
		// asserted explicitly, or this passes against a physical DELETE too.
		const stays = await repo.createTask({ title: "in the backup" });
		const goes = await repo.createTask({ title: "not in the backup" });
		await repo.bulkImport(
			exportWith([{ id: stays.id, title: "in the backup" }]),
			"replace",
		);
		const rows = await db.select<{ id: string; purged_at: string | null }>(
			"SELECT id, purged_at FROM tasks ORDER BY id",
		);
		const byId = new Map(rows.map((r) => [r.id, r.purged_at]));
		expect(byId.has(goes.id)).toBe(true);
		expect(byId.get(goes.id)).not.toBeNull();
		expect(byId.get(stays.id)).toBeNull();
	});

	it("does not physically delete rows in replace mode", async () => {
		// A physical DELETE fires the trigger and fills the outbox with entries
		// pointing at rows that no longer exist — the engine cannot tell
		// "purged" from "never existed".
		const goes = await repo.createTask({ title: "x" });
		await repo.bulkImport(exportWith([]), "replace");
		const rows = await db.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE id = ?",
			[goes.id],
		);
		expect(rows[0].n).toBe(1);
	});

	it("does not re-stamp an already-tombstoned row on replace", async () => {
		// Guards WHERE purged_at IS NULL: without it, every import re-stamps
		// every old tombstone and re-pushes it to the server forever.
		const goes = await repo.createTask({ title: "x" });
		await repo.deleteTask(goes.id);
		const before = await stampsOf(db, goes.id);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.bulkImport(exportWith([]), "replace");
		const after = await stampsOf(db, goes.id);
		expect(after.purged_at.t).toBe(before.purged_at.t);
	});

	it("resurrects a tombstoned task the backup still contains", async () => {
		// This is the documented consequence of "import propagates": restoring a
		// backup older than a deletion undoes that deletion everywhere. The
		// confirmation dialog in the next task is what makes it consented.
		const task = await repo.createTask({ title: "x" });
		await repo.deleteTask(task.id);
		await repo.bulkImport(exportWith([{ id: task.id, title: "x" }]), "merge");
		const rows = await db.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].purged_at).toBeNull();
	});

	it("keeps the payload order of an imported task list", async () => {
		// Export reads display order, so a per-row head key made every
		// export-then-import invert the user's entire list — silently, because
		// nothing here had ever asserted more than one imported row's position.
		await repo.bulkImport(
			exportWith([
				{ id: "t1", title: "first" },
				{ id: "t2", title: "second" },
				{ id: "t3", title: "third" },
				{ id: "t4", title: "fourth" },
			]),
			"replace",
		);
		expect((await repo.getTasks({ allTasks: true })).map((t) => t.id)).toEqual([
			"t1",
			"t2",
			"t3",
			"t4",
		]);
	});

	it("keeps an imported list above the rows already present", async () => {
		// The block of keys has to start above the current head, not from nothing:
		// generating from null would interleave the import with existing rows.
		const existing = await repo.createTask({ title: "already here" });
		await repo.bulkImport(
			exportWith([
				{ id: "t1", title: "first" },
				{ id: "t2", title: "second" },
			]),
			"merge",
		);
		expect((await repo.getTasks({ allTasks: true })).map((t) => t.id)).toEqual([
			"t1",
			"t2",
			existing.id,
		]);
	});

	it("stamps completed_at on an imported task", async () => {
		// createTask never stamps completed_at, so presence alone is a genuine
		// discriminator here. An unstamped completed_at loses to any remote value
		// and reverts on the first sync: the import silently un-does itself.
		await repo.bulkImport(
			exportWith([
				{ id: "t1", title: "x", completedAt: "2020-02-02T00:00:00.000Z" },
			]),
			"merge",
		);
		expect((await stampsOf(db, "t1")).completed_at).toBeDefined();
	});

	it("stamps purged_at when an import resurrects a tombstone", async () => {
		// OR REPLACE is a DELETE-then-INSERT: purged_at comes back NULL whether or
		// not the statement names it, so only the stamp proves the resurrection is
		// a change this device will push rather than a local-only edit.
		const task = await repo.createTask({ title: "x" });
		await repo.deleteTask(task.id);
		const before = (await stampsOf(db, task.id)).purged_at.t;
		await new Promise((resolve) => setTimeout(resolve, 2));
		await repo.bulkImport(exportWith([{ id: task.id, title: "x" }]), "merge");
		expect((await stampsOf(db, task.id)).purged_at.t).not.toBe(before);
	});

	it("keeps a project's group through an import", async () => {
		// group_id was absent from the projects column list, so every colliding
		// project came back ungrouped — and unstamped, so the ungrouping spread.
		const group = await repo.createProjectGroup({ name: "g", color: "#000" });
		const created = await repo.createProject({ name: "p" });
		await repo.assignProjectToGroup(created.id, group.id);
		const grouped = (await repo.getProjects()).find(
			(p) => p.id === created.id,
		) as Project;

		await repo.bulkImport(
			{
				version: 1,
				exportedAt: "2020-01-01T00:00:00.000Z",
				projects: [grouped],
				tags: [],
				tasks: [],
			},
			"merge",
		);

		const after = (await repo.getProjects()).find((p) => p.id === created.id);
		expect(after?.groupId).toBe(group.id);
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM projects WHERE id = ?",
			[created.id],
		);
		expect(JSON.parse(rows[0].field_updated_at ?? "{}").group_id).toBeDefined();
	});

	it("keeps stamps for columns the import does not write", async () => {
		// Seeded rather than produced by a write path, because today's column list
		// happens to cover every field any write path stamps. The contract still
		// has to hold: the next column added to the schema would otherwise have
		// its stamp erased by any import that touches the row.
		const task = await repo.createTask({ title: "x" });
		await db.execute("UPDATE tasks SET field_updated_at = ? WHERE id = ?", [
			JSON.stringify({
				future_column: { t: "2020-01-01T00:00:00.000Z", d: "x" },
			}),
			task.id,
		]);
		await repo.bulkImport(exportWith([{ id: task.id, title: "x" }]), "merge");
		expect((await stampsOf(db, task.id)).future_column).toBeDefined();
	});

	it("tombstones more absent rows than one statement can bind", async () => {
		// Pins the chunk loop, not the ceiling itself: proving the old NOT IN
		// actually broke would need a payload past SQLITE_MAX_VARIABLE_NUMBER,
		// which is far too slow to seed. What this does catch is a chunk boundary
		// that drops or double-counts rows, which is how the fix can go wrong.
		const kept: Array<{ id: string; title: string }> = [];
		for (let i = 0; i < 1200; i++) {
			await db.execute(
				"INSERT INTO tasks (id, title, sort_order, sort_key, created_at, updated_at) VALUES (?, 'x', 0, ?, 'x', 'x')",
				[`t${i}`, `a${i}`],
			);
			if (i % 2 === 0) kept.push({ id: `t${i}`, title: "x" });
		}
		await repo.bulkImport(exportWith(kept), "replace");
		const rows = await db.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE purged_at IS NOT NULL",
		);
		expect(rows[0].n).toBe(600);
	});

	it("applies the whole import atomically", async () => {
		// A pre-existing task gives the replace's tombstoning UPDATE something
		// real to roll back — an empty table would leave this test passing even
		// unwrapped, since "nothing before, nothing after" holds either way.
		const existing = await repo.createTask({ title: "pre-existing" });
		const before = await repo.getTasks({});
		db.failNextExecuteMatching(/INSERT OR REPLACE INTO tasks/);
		await expect(
			repo.bulkImport(exportWith([{ id: "t1", title: "x" }]), "replace"),
		).rejects.toThrow();
		expect(await repo.getTasks({})).toEqual(before);
		const rows = await db.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM tasks WHERE id = ?",
			[existing.id],
		);
		expect(rows[0]?.purged_at).toBeNull();
	});
});

describe("bulkImport — a project whose group is absent locally", () => {
	// Real SQLite, deliberately: ExportData carries no project_groups array, so
	// restoring onto a fresh install hands projects.group_id a foreign key that
	// does not resolve. MemoryRepository.bulkImport enforces no referential
	// integrity, so the same case passes there whatever the code does.
	let db: BetterSqliteDriver;
	let repo: SqliteRepository;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		repo = new SqliteRepository(db);
	});

	afterEach(() => db?.close());

	function exportWithGroupedProject(): ExportData {
		return {
			version: 1,
			exportedAt: "2026-05-18T10:00:00.000Z",
			projects: [
				{
					id: "p1",
					name: "Work",
					color: "#f00",
					icon: null,
					sortOrder: 0,
					sortKey: "a0",
					groupId: "g-missing",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			tags: [],
			tasks: [],
		};
	}

	it("imports it ungrouped instead of failing the whole transaction", async () => {
		await expect(
			repo.bulkImport(exportWithGroupedProject(), "merge"),
		).resolves.toBeUndefined();

		const rows = await db.select<{ group_id: string | null }>(
			"SELECT group_id FROM projects WHERE id = 'p1'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].group_id).toBeNull();
	});

	it("stamps the group_id it nulled, so the ungrouping propagates", async () => {
		// An unstamped NULL loses to any remote group_id on the first sync, and
		// the project silently returns to a group this device cannot resolve.
		await repo.bulkImport(exportWithGroupedProject(), "merge");
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM projects WHERE id = 'p1'",
		);
		expect(JSON.parse(rows[0].field_updated_at ?? "{}").group_id).toBeDefined();
	});

	it("keeps group_id when the group does exist locally", async () => {
		await db.execute(
			"INSERT INTO project_groups (id, name, color, sort_order, sort_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			["g-missing", "Group", "#fff", 0, "a0", "2026-01-01", "2026-01-01"],
		);
		await repo.bulkImport(exportWithGroupedProject(), "merge");
		const rows = await db.select<{ group_id: string | null }>(
			"SELECT group_id FROM projects WHERE id = 'p1'",
		);
		expect(rows[0].group_id).toBe("g-missing");
	});
});

describe("bulkImport — references the payload names but this device lacks", () => {
	// Real SQLite throughout, deliberately: every case here is a constraint the
	// schema enforces and MemoryRepository does not, so the same tests pass
	// there whatever the code does. See the group-absent block above.
	let db: BetterSqliteDriver;
	let repo: SqliteRepository;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		repo = new SqliteRepository(db);
	});

	afterEach(() => db?.close());

	function exportOf(over: Partial<ExportData> = {}): ExportData {
		return {
			version: 1,
			exportedAt: "2026-05-18T10:00:00.000Z",
			projects: [],
			tags: [],
			tasks: [],
			...over,
		};
	}

	function task(over: Partial<Task> = {}): Task {
		return {
			id: "t1",
			title: "Task",
			description: null,
			projectId: null,
			priority: "none",
			dueDate: null,
			completedAt: null,
			deletedAt: null,
			tags: [],
			sortOrder: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			...over,
		};
	}

	function tag(over: Partial<Tag> = {}): Tag {
		return {
			id: "g1",
			name: "urgent",
			color: "#fff",
			projectId: null,
			...over,
		};
	}

	async function seedTag(id: string, name: string): Promise<void> {
		await db.execute(
			"INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			[id, name, "#fff", "2026-01-01", "2026-01-01"],
		);
	}

	async function seedProject(id: string): Promise<void> {
		await db.execute(
			"INSERT INTO projects (id, name, color, sort_order, sort_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[id, `Project ${id}`, "#f00", 0, `a${id}`, "2026-01-01", "2026-01-01"],
		);
	}

	// ---- F: tombstoning blanks tags.name, which is NOT NULL UNIQUE ----

	it("tombstones two absent tags at once without colliding on the blanked name", async () => {
		await seedTag("a", "alpha");
		await seedTag("b", "beta");
		await expect(
			repo.bulkImport(exportOf(), "replace"),
		).resolves.toBeUndefined();
	});

	it("leaves no user-visible content in a tombstoned tag's name", async () => {
		await seedTag("a", "alpha");
		await seedTag("b", "beta");
		await repo.bulkImport(exportOf(), "replace");
		const rows = await db.select<{ id: string; name: string }>(
			"SELECT id, name FROM tags ORDER BY id",
		);
		expect(rows.map((r) => r.name)).not.toContain("alpha");
		expect(rows.map((r) => r.name)).not.toContain("beta");
	});

	// ---- A: tasks.project_id names a project this device does not have ----

	it("imports a task whose project is absent into the Inbox", async () => {
		const data = exportOf({ tasks: [task({ projectId: "p-missing" })] });
		await expect(repo.bulkImport(data, "merge")).resolves.toBeUndefined();
		const rows = await db.select<{ project_id: string | null }>(
			"SELECT project_id FROM tasks WHERE id = 't1'",
		);
		expect(rows[0].project_id).toBeNull();
	});

	it("stamps the project_id it cleared, so the move to the Inbox propagates", async () => {
		// An unstamped NULL loses to any remote project_id on the first sync, and
		// the task silently returns to a project this device cannot resolve.
		await repo.bulkImport(
			exportOf({ tasks: [task({ projectId: "p-missing" })] }),
			"merge",
		);
		const rows = await db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = 't1'",
		);
		expect(
			JSON.parse(rows[0].field_updated_at ?? "{}").project_id,
		).toBeDefined();
	});

	it("keeps a task's project when the payload carries that project itself", async () => {
		const data = exportOf({
			projects: [
				{
					id: "p1",
					name: "Work",
					color: "#f00",
					icon: null,
					sortOrder: 0,
					sortKey: "a0",
					groupId: null,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			tasks: [task({ projectId: "p1" })],
		});
		await repo.bulkImport(data, "merge");
		const rows = await db.select<{ project_id: string | null }>(
			"SELECT project_id FROM tasks WHERE id = 't1'",
		);
		expect(rows[0].project_id).toBe("p1");
	});

	it("keeps a task's project when only this device has it", async () => {
		// The point of resolving late: the same tasks-only backup restores intact
		// onto the device it came from, and degrades only where the project is gone.
		await seedProject("p1");
		await repo.bulkImport(
			exportOf({ tasks: [task({ projectId: "p1" })] }),
			"merge",
		);
		const rows = await db.select<{ project_id: string | null }>(
			"SELECT project_id FROM tasks WHERE id = 't1'",
		);
		expect(rows[0].project_id).toBe("p1");
	});

	// ---- B: tags.project_id names a project this device does not have ----

	it("imports a tag scoped to an absent project as unscoped", async () => {
		const data = exportOf({ tags: [tag({ projectId: "p-missing" })] });
		await expect(repo.bulkImport(data, "merge")).resolves.toBeUndefined();
		const rows = await db.select<{ project_id: string | null }>(
			"SELECT project_id FROM tags WHERE id = 'g1'",
		);
		expect(rows[0].project_id).toBeNull();
	});

	it("keeps a tag's project scope when this device has that project", async () => {
		await seedProject("p1");
		await repo.bulkImport(
			exportOf({ tags: [tag({ projectId: "p1" })] }),
			"merge",
		);
		const rows = await db.select<{ project_id: string | null }>(
			"SELECT project_id FROM tags WHERE id = 'g1'",
		);
		expect(rows[0].project_id).toBe("p1");
	});

	it("links only the tags a replace import carries", async () => {
		// Was a mock-driver test asserting the bind values of the task_tags
		// INSERT. It could not see whether the tag row existed, which is the
		// only thing that decides the outcome.
		const carried = tag({ id: "g1", name: "urgent" });
		const outside = tag({ id: "g-outside", name: "other" });
		const data = exportOf({
			tags: [carried],
			tasks: [task({ tags: [carried, outside] })],
		});
		await repo.bulkImport(data, "replace");
		const rows = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = 't1'",
		);
		expect(rows.map((r) => r.tag_id)).toEqual(["g1"]);
	});

	// ---- previewImport: the same rules, counted before anything is written ----

	it("reports the tasks an import would move to the Inbox", async () => {
		const gaps = await repo.previewImport(
			exportOf({ tasks: [task({ projectId: "p-missing" })] }),
			"merge",
		);
		expect(gaps.inboxedTasks).toBe(1);
	});

	it("reports the tags an import would import unscoped", async () => {
		const gaps = await repo.previewImport(
			exportOf({ tags: [tag({ projectId: "p-missing" })] }),
			"merge",
		);
		expect(gaps.unscopedTags).toBe(1);
	});

	it("reports the tag links an import would drop", async () => {
		const gaps = await repo.previewImport(
			exportOf({ tasks: [task({ tags: [tag()] })] }),
			"merge",
		);
		expect(gaps.droppedTagLinks).toBe(1);
	});

	it("reports nothing when this device can resolve the whole payload", async () => {
		await seedProject("p1");
		await seedTag("g1", "urgent");
		const gaps = await repo.previewImport(
			exportOf({ tasks: [task({ projectId: "p1", tags: [tag()] })] }),
			"merge",
		);
		expect(gaps).toEqual({
			inboxedTasks: 0,
			unscopedTags: 0,
			droppedTagLinks: 0,
		});
	});

	it("counts a project the payload carries itself as present", async () => {
		const gaps = await repo.previewImport(
			exportOf({
				projects: [
					{
						id: "p1",
						name: "Work",
						color: "#f00",
						icon: null,
						sortOrder: 0,
						sortKey: "a0",
						groupId: null,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				tasks: [task({ projectId: "p1" })],
			}),
			"merge",
		);
		expect(gaps.inboxedTasks).toBe(0);
	});

	it("counts a project a replace import would tombstone as absent", async () => {
		await seedProject("p1");
		const data = exportOf({ tasks: [task({ projectId: "p1" })] });
		expect((await repo.previewImport(data, "merge")).inboxedTasks).toBe(0);
		expect((await repo.previewImport(data, "replace")).inboxedTasks).toBe(1);
	});

	it("does not report a link that a same-name local tag will absorb", async () => {
		await seedTag("g-local", "urgent");
		const gaps = await repo.previewImport(
			exportOf({
				tags: [tag({ id: "g-remote" })],
				tasks: [task({ tags: [tag({ id: "g-remote" })] })],
			}),
			"merge",
		);
		expect(gaps.droppedTagLinks).toBe(0);
	});

	it("writes nothing", async () => {
		await repo.previewImport(
			exportOf({ tasks: [task({ projectId: "p-missing" })] }),
			"merge",
		);
		const rows = await db.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks",
		);
		expect(rows[0].n).toBe(0);
	});

	it("predicts exactly what the import then does", async () => {
		// The preview models bulkImport's resolution instead of executing it, so
		// the two can drift. This is the test that catches that.
		await seedTag("g-local", "shared");
		const data = exportOf({
			projects: [
				{
					id: "p-keep",
					name: "Keep",
					color: "#f00",
					icon: null,
					sortOrder: 0,
					sortKey: "a0",
					groupId: null,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			tags: [
				tag({ id: "gA", name: "alpha", projectId: "p-missing" }),
				tag({ id: "gB", name: "beta", projectId: "p-keep" }),
				tag({ id: "g-remote", name: "shared" }),
			],
			tasks: [
				task({
					id: "t1",
					projectId: "p-missing",
					tags: [
						tag({ id: "g-gone", name: "gone" }),
						tag({ id: "g-remote", name: "shared" }),
					],
				}),
				task({ id: "t2", projectId: "p-keep" }),
			],
		});

		const gaps = await repo.previewImport(data, "merge");
		await repo.bulkImport(data, "merge");

		const inboxed = await db.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE project_id IS NULL",
		);
		const unscoped = await db.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tags WHERE id IN ('gA', 'gB') AND project_id IS NULL",
		);
		const links = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = 't1'",
		);
		expect({
			inboxedTasks: inboxed[0].n,
			unscopedTags: unscoped[0].n,
			droppedTagLinks: 2 - links.length,
		}).toEqual(gaps);
		expect(links.map((r) => r.tag_id)).toEqual(["g-local"]);
	});

	// ---- D: replace tombstones the very project the payload's tasks name ----

	// ---- C and E: task_tags.tag_id names a tag that is not in the table ----

	it("drops a tag link when the tag is absent and no local tag owns its name", async () => {
		// Reachable by unchecking "tags": dataTransfer.ts sends `tags: []` while
		// tasks still carry their tags, and task_tags.tag_id is NOT NULL
		// REFERENCES tags(id).
		const data = exportOf({ tasks: [task({ tags: [tag()] })] });
		await expect(repo.bulkImport(data, "merge")).resolves.toBeUndefined();
		const rows = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = 't1'",
		);
		expect(rows).toEqual([]);
	});

	it("remaps a tag link to the local tag that already owns the name", async () => {
		// The ordinary two-device merge: tags.name is globally UNIQUE, so OR
		// IGNORE keeps the local row and the payload's id is never inserted.
		// Dropping the link here would lose tag assignments on every such import.
		await seedTag("g-local", "urgent");
		const data = exportOf({
			tags: [tag({ id: "g-remote" })],
			tasks: [task({ tags: [tag({ id: "g-remote" })] })],
		});
		await expect(repo.bulkImport(data, "merge")).resolves.toBeUndefined();
		const rows = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = 't1'",
		);
		expect(rows.map((r) => r.tag_id)).toEqual(["g-local"]);
	});

	it("keeps a tag link when the tag id itself is present locally", async () => {
		await seedTag("g1", "urgent");
		await repo.bulkImport(
			exportOf({ tasks: [task({ tags: [tag()] })] }),
			"merge",
		);
		const rows = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = 't1'",
		);
		expect(rows.map((r) => r.tag_id)).toEqual(["g1"]);
	});

	it("drops a tag link to a tag this replace import tombstones", async () => {
		// Same reasoning as the project case below: the tombstone still satisfies
		// the foreign key, so only a live-tag check keeps the link honest.
		await seedTag("g1", "urgent");
		await repo.bulkImport(
			exportOf({ tasks: [task({ tags: [tag()] })] }),
			"replace",
		);
		const rows = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = 't1'",
		);
		expect(rows).toEqual([]);
	});

	it("inboxes a task whose project this same import tombstones", async () => {
		// The row survives the foreign key because a tombstone is not a delete,
		// so nothing fails — the task just hangs off a purged project, invisible
		// in a sidebar that lists only live ones.
		await seedProject("p1");
		await repo.bulkImport(
			exportOf({ tasks: [task({ projectId: "p1" })] }),
			"replace",
		);
		const rows = await db.select<{ project_id: string | null }>(
			"SELECT project_id FROM tasks WHERE id = 't1'",
		);
		expect(rows[0].project_id).toBeNull();
	});
});
