import { describe, it, expect, vi } from "vitest";
import { SqliteRepository } from "./sqlite-repository";
import type { DbDriver } from "./driver";

// Internal row shape — mirrors what SQLite returns
interface TaskRow {
  id: string; title: string; project_id: string | null; priority: string;
  due_date: string | null; completed_at: string | null; sort_order: number;
  created_at: string; updated_at: string;
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
      select: vi.fn()
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
        ]),
    });
    const repo = new SqliteRepository(db);
    const project = await repo.createProject({ name: "Boulot", color: "#6366f1", icon: "💼" });
    expect(project.name).toBe("Boulot");
    expect(project.color).toBe("#6366f1");
    expect(typeof project.id).toBe("string");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("getProjects returns only non-deleted rows, mapped to Project", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "p1", name: "A", color: null, icon: null, sort_order: 0, created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T10:00:00.000Z" },
        { id: "p2", name: "B", color: "#f00", icon: "🚀", sort_order: 1, created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T10:00:00.000Z" },
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
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at");
    expect(params).toContain("proj-1");
  });

  it("updateProject updates specified fields and sets updated_at", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "p1", name: "Updated", color: null, icon: null, sort_order: 0, created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T11:00:00.000Z" },
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
      select: vi.fn().mockResolvedValueOnce([
        { id: "tag-1", name: "urgent", color: "#f00", created_at: "2026-04-10T10:00:00.000Z", updated_at: "2026-04-10T10:00:00.000Z" },
      ]),
    });
    const repo = new SqliteRepository(db);
    const tag = await repo.createTag({ name: "urgent", color: "#f00" });
    expect(tag.name).toBe("urgent");
    expect(tag.color).toBe("#f00");
  });

  it("getTags returns only non-deleted rows", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "t1", name: "work", color: null },
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
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at");
    expect(params).toContain("tag-1");
  });

  it("updateTag updates specified fields and sets updated_at", async () => {
    const db = makeDb({
      select: vi.fn().mockResolvedValueOnce([
        { id: "t1", name: "urgent", color: "#f00" },
      ]),
    });
    const repo = new SqliteRepository(db);
    await repo.updateTag("t1", { color: "#f00" });
    const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("color = ?");
    expect(sql).toContain("updated_at = ?");
  });
});

describe("SqliteRepository — tasks", () => {
  const taskRow: TaskRow = {
    id: "task-1",
    title: "Préparer la démo",
    project_id: "proj-1",
    priority: "high",
    due_date: "2026-04-12",
    completed_at: null,
    sort_order: 0,
    created_at: "2026-04-10T10:00:00.000Z",
    updated_at: "2026-04-10T10:00:00.000Z",
  };

  it("createTask inserts a task and returns it with empty tags", async () => {
    const db = makeDb({
      select: vi.fn()
        .mockResolvedValueOnce([taskRow])   // getTask after insert
        .mockResolvedValueOnce([]),          // task_tags join
    });
    const repo = new SqliteRepository(db);
    const task = await repo.createTask({ title: "Préparer la démo", projectId: "proj-1", priority: "high" });
    expect(task.title).toBe("Préparer la démo");
    expect(task.tags).toEqual([]);
    expect(task.priority).toBe("high");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("createTask inserts task_tags rows when tagIds provided", async () => {
    const db = makeDb({
      select: vi.fn()
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

  it("getTasks with no filters excludes completed tasks", async () => {
    const db = makeDb({ select: vi.fn().mockResolvedValue([]) });
    const repo = new SqliteRepository(db);
    await repo.getTasks();
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("completed_at IS NULL");
  });

  it("completeTask sets completed_at", async () => {
    const completedRow = { ...taskRow, completed_at: "2026-04-10T11:00:00.000Z" };
    const db = makeDb({
      select: vi.fn()
        .mockResolvedValueOnce([completedRow])
        .mockResolvedValueOnce([]),
    });
    const repo = new SqliteRepository(db);
    const task = await repo.completeTask("task-1");
    expect(task.completedAt).not.toBeNull();
    const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("completed_at");
  });

  it("deleteTask sets deleted_at (soft delete)", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.deleteTask("task-1");
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at");
    expect(params).toContain("task-1");
  });

  it("getTasks merges tag data from task_tags join", async () => {
    const db = makeDb({
      select: vi.fn()
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
      select: vi.fn()
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
      select: vi.fn()
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
