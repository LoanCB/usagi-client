import type { DbDriver } from "./driver";
import type { TodoRepository } from "./repository";
import type {
  Task,
  Project,
  Tag,
  TaskFilters,
  CreateTaskInput,
  CreateProjectInput,
  CreateTagInput,
} from "@/types";

// ---- Row types returned by SQLite (snake_case) ----

interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: string;
  name: string;
  color: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TaskTagRow {
  task_id: string;
  tag_id: string;
  name: string;
  color: string | null;
}

// ---- Mappers ----

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, color: row.color };
}

function mapTask(row: TaskRow, tags: Tag[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    priority: row.priority as Task["priority"],
    dueDate: row.due_date,
    completedAt: row.completed_at,
    tags,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- Repository ----

export class SqliteRepository implements TodoRepository {
  constructor(private readonly db: DbDriver) {}

  // ---------- Projects ----------

  async getProjects(): Promise<Project[]> {
    const rows = await this.db.select<ProjectRow>(
      "SELECT id, name, color, icon, sort_order, created_at, updated_at FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, created_at"
    );
    return rows.map(mapProject);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO projects (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [id, input.name, input.color ?? null, input.icon ?? null, now, now]
    );
    return (await this._getProject(id))!;
  }

  async updateProject(id: string, patch: Partial<CreateProjectInput>): Promise<Project> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if ("name" in patch) { sets.push("name = ?"); params.push(patch.name); }
    if ("color" in patch) { sets.push("color = ?"); params.push(patch.color ?? null); }
    if ("icon" in patch) { sets.push("icon = ?"); params.push(patch.icon ?? null); }
    params.push(id);
    await this.db.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, params);
    return (await this._getProject(id))!;
  }

  async deleteProject(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  }

  private async _getProject(id: string): Promise<Project | null> {
    const rows = await this.db.select<ProjectRow>(
      "SELECT id, name, color, icon, sort_order, created_at, updated_at FROM projects WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    return rows[0] ? mapProject(rows[0]) : null;
  }

  // ---------- Tags ----------

  async getTags(): Promise<Tag[]> {
    const rows = await this.db.select<TagRow>(
      "SELECT id, name, color FROM tags WHERE deleted_at IS NULL ORDER BY name"
    );
    return rows.map(mapTag);
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, input.name, input.color ?? null, now, now]
    );
    return (await this._getTag(id))!;
  }

  async updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if ("name" in patch) { sets.push("name = ?"); params.push(patch.name); }
    if ("color" in patch) { sets.push("color = ?"); params.push(patch.color ?? null); }
    params.push(id);
    await this.db.execute(`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`, params);
    return (await this._getTag(id))!;
  }

  async deleteTag(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  }

  private async _getTag(id: string): Promise<Tag | null> {
    const rows = await this.db.select<TagRow>(
      "SELECT id, name, color FROM tags WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    return rows[0] ? mapTag(rows[0]) : null;
  }

  // ---------- Tasks ----------

  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const conditions: string[] = ["t.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (filters?.projectId === null) {
      conditions.push("t.project_id IS NULL");
    } else if (filters?.projectId !== undefined) {
      conditions.push("t.project_id = ?");
      params.push(filters.projectId);
    }

    if (filters?.priority) {
      conditions.push("t.priority = ?");
      params.push(filters.priority);
    }

    if (filters?.completed === true) {
      conditions.push("t.completed_at IS NOT NULL");
    } else {
      conditions.push("t.completed_at IS NULL");
    }

    if (filters?.dueBefore) {
      conditions.push("t.due_date <= ?");
      params.push(filters.dueBefore);
    }

    let sql = `SELECT t.id, t.title, t.description, t.project_id, t.priority, t.due_date, t.completed_at, t.sort_order, t.created_at, t.updated_at FROM tasks t WHERE ${conditions.join(" AND ")} ORDER BY t.sort_order, t.created_at`;

    if (filters?.tagIds && filters.tagIds.length > 0) {
      const placeholders = filters.tagIds.map(() => "?").join(", ");
      sql = `SELECT DISTINCT t.id, t.title, t.description, t.project_id, t.priority, t.due_date, t.completed_at, t.sort_order, t.created_at, t.updated_at FROM tasks t INNER JOIN task_tags tt ON tt.task_id = t.id WHERE ${conditions.join(" AND ")} AND tt.tag_id IN (${placeholders}) ORDER BY t.sort_order, t.created_at`;
      params.push(...filters.tagIds);
    }

    const taskRows = await this.db.select<TaskRow>(sql, params);
    if (taskRows.length === 0) return [];
    return this._attachTags(taskRows);
  }

  async getTask(id: string): Promise<Task | null> {
    const rows = await this.db.select<TaskRow>(
      "SELECT id, title, description, project_id, priority, due_date, completed_at, sort_order, created_at, updated_at FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    if (!rows[0]) return null;
    const withTags = await this._attachTags([rows[0]]);
    return withTags[0];
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO tasks (id, title, description, project_id, priority, due_date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
      [id, input.title, input.description ?? null, input.projectId ?? null, input.priority ?? "none", input.dueDate ?? null, now, now]
    );
    if (input.tagIds && input.tagIds.length > 0) {
      for (const tagId of input.tagIds) {
        await this.db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", [id, tagId]);
      }
    }
    return (await this.getTask(id))!;
  }

  async updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [now];
    if ("title" in patch) { sets.push("title = ?"); params.push(patch.title); }
    if ("description" in patch) { sets.push("description = ?"); params.push(patch.description ?? null); }
    if ("projectId" in patch) { sets.push("project_id = ?"); params.push(patch.projectId ?? null); }
    if ("priority" in patch) { sets.push("priority = ?"); params.push(patch.priority); }
    if ("dueDate" in patch) { sets.push("due_date = ?"); params.push(patch.dueDate ?? null); }
    params.push(id);
    await this.db.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, params);
    if ("tagIds" in patch && patch.tagIds !== undefined) {
      await this.db.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
      for (const tagId of patch.tagIds) {
        await this.db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", [id, tagId]);
      }
    }
    return (await this.getTask(id))!;
  }

  async completeTask(id: string): Promise<Task> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
    return (await this.getTask(id))!;
  }

  async uncompleteTask(id: string): Promise<Task> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tasks SET completed_at = NULL, updated_at = ? WHERE id = ?", [now, id]);
    return (await this.getTask(id))!;
  }

  async deleteTask(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  }

  async reorderTasks(orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.execute("UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?", [i, now, orderedIds[i]]);
    }
  }

  private async _attachTags(taskRows: TaskRow[]): Promise<Task[]> {
    if (taskRows.length === 0) return [];
    const ids = taskRows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(", ");
    const tagRows = await this.db.select<TaskTagRow>(
      `SELECT tt.task_id, t.id as tag_id, t.name, t.color FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE t.deleted_at IS NULL AND tt.task_id IN (${placeholders})`,
      ids
    );
    const byTaskId = new Map<string, Tag[]>();
    for (const row of tagRows) {
      if (!byTaskId.has(row.task_id)) byTaskId.set(row.task_id, []);
      byTaskId.get(row.task_id)!.push({ id: row.tag_id, name: row.name, color: row.color });
    }
    return taskRows.map((row) => mapTask(row, byTaskId.get(row.id) ?? []));
  }
}
