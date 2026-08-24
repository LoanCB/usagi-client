import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { ExportData } from "@/lib/dataTransfer";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import type {
	CreateProjectGroupInput,
	CreateProjectInput,
	CreateTagInput,
	CreateTaskInput,
	Project,
	ProjectGroup,
	Tag,
	Task,
	TaskFilters,
} from "@/types";
import { getOrCreateDeviceId } from "./device-id";
import type { DbDriver } from "./driver";
import { stampFields } from "./field-timestamps";
import {
	countImportGaps,
	type ImportGaps,
	predictReferents,
	resolveProjectRef,
	resolveTagLink,
} from "./import-resolution";
import type { TodoRepository } from "./repository";

// Tables that carry a field_updated_at stamp map. Closed so a table name can
// never arrive from an arbitrary string into SQL.
type SyncedTable = "tasks" | "projects" | "tags" | "project_groups";

/**
 * Every column bulkImport's INSERT OR REPLACE writes *or resets*, per table.
 *
 * The reset ones matter as much as the written ones: OR REPLACE is a
 * DELETE-then-INSERT, so a column left out of the statement comes back NULL.
 * An un-completed task or a resurrected tombstone that carries no stamp for
 * that column loses to any remote value and reverts on the first sync — the
 * §1.2 failure the whole plan exists to close.
 */
const IMPORT_STAMPED_FIELDS = {
	projects: [
		"name",
		"color",
		"icon",
		"group_id",
		"sort_key",
		"deleted_at",
		"purged_at",
	],
	tags: ["name", "color", "project_id", "deleted_at", "purged_at"],
	tasks: [
		"title",
		"description",
		"project_id",
		"priority",
		"due_date",
		"tags",
		"sort_key",
		"completed_at",
		"deleted_at",
		"purged_at",
	],
} as const;

/**
 * How many ids one statement may bind.
 *
 * Well under SQLite's SQLITE_MAX_VARIABLE_NUMBER, so a bulk write stays bounded
 * by the number of statements rather than by the size of the payload.
 */
const ID_CHUNK_SIZE = 500;

/** Tables carrying a sort_key. */
type OrderedTable = "tasks" | "projects" | "project_groups";

/**
 * The tables whose sort_key values are comparable with each other.
 *
 * Projects and project groups share one space because the sidebar's top level
 * interleaves them: a project dropped between two groups needs a key that sits
 * between theirs. Before fractional keys they shared a single sort_order number
 * line; keeping one space preserves that. Two independent spaces would leave the
 * merged list with no ordering source at all.
 */
const KEY_SPACE: Record<OrderedTable, readonly OrderedTable[]> = {
	tasks: ["tasks"],
	projects: ["projects", "project_groups"],
	project_groups: ["projects", "project_groups"],
};

function buildProjectIdsCondition(
	projectIds: string[] | undefined,
): { clause: string; params: string[] } | null {
	if (!projectIds || projectIds.length === 0) return null;
	const realIds = projectIds.filter((id) => id !== INBOX_PROJECT_ID);
	const includeInbox = projectIds.includes(INBOX_PROJECT_ID);
	const clauses: string[] = [];
	const params: string[] = [];
	if (realIds.length > 0) {
		clauses.push(`t.project_id IN (${realIds.map(() => "?").join(", ")})`);
		params.push(...realIds);
	}
	if (includeInbox) {
		clauses.push("t.project_id IS NULL");
	}
	if (clauses.length === 0) return null;
	return { clause: `(${clauses.join(" OR ")})`, params };
}

// ---- Row types returned by SQLite (snake_case) ----

interface ProjectRow {
	id: string;
	name: string;
	color: string | null;
	icon: string | null;
	sort_order: number;
	sort_key: string;
	group_id: string | null;
	created_at: string;
	updated_at: string;
}

interface ProjectGroupRow {
	id: string;
	name: string;
	color: string;
	sort_order: number;
	sort_key: string;
	created_at: string;
	updated_at: string;
}

interface TagRow {
	id: string;
	name: string;
	color: string | null;
	project_id: string | null;
}

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

interface TaskTagRow {
	task_id: string;
	tag_id: string;
	name: string;
	color: string | null;
	project_id: string | null;
}

// ---- Mappers ----

function mapProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		icon: row.icon,
		sortOrder: row.sort_order,
		sortKey: row.sort_key,
		groupId: row.group_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapProjectGroup(row: ProjectGroupRow): ProjectGroup {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		sortOrder: row.sort_order,
		sortKey: row.sort_key,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapTag(row: TagRow): Tag {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		projectId: row.project_id,
	};
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
		deletedAt: row.deleted_at ?? null,
		tags,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ---- Repository ----

export class SqliteRepository implements TodoRepository {
	constructor(private readonly db: DbDriver) {}

	/**
	 * Merge `fields` into a task's stamp map, preserving the stamps of fields
	 * this write did not touch.
	 *
	 * Every method that writes an LWW-governed column has to call this, not just
	 * updateTask — see the §1.2 correction in the spec for the list and for what
	 * a merge engine does when a write path skips it.
	 *
	 * Pass the `tx` from the enclosing `transaction` call: a column that moved
	 * without its stamp moving is invisible to the merge engine, so the two
	 * writes have to commit together or not at all.
	 */
	private async _stamp(
		table: SyncedTable,
		id: string,
		fields: string[],
		now: string,
		tx: DbDriver = this.db,
	): Promise<void> {
		const deviceId = await getOrCreateDeviceId(tx);
		const prior = await tx.select<{ field_updated_at: string | null }>(
			`SELECT field_updated_at FROM ${table} WHERE id = ?`,
			[id],
		);
		await tx.execute(`UPDATE ${table} SET field_updated_at = ? WHERE id = ?`, [
			stampFields(prior[0]?.field_updated_at ?? null, fields, now, deviceId),
			id,
		]);
	}

	/**
	 * Every row's current stamp map for `table`, keyed by id.
	 *
	 * Read in one unfiltered pass rather than per row: a bulk write still has to
	 * merge into the stamps a row already carries, and binding one variable per
	 * payload id would hit SQLite's parameter ceiling on a large backup.
	 */
	private async _priorStamps(
		table: SyncedTable,
		tx: DbDriver,
	): Promise<Map<string, string | null>> {
		const rows = await tx.select<{
			id: string;
			field_updated_at: string | null;
		}>(`SELECT id, field_updated_at FROM ${table}`);
		return new Map(rows.map((r) => [r.id, r.field_updated_at ?? null]));
	}

	/**
	 * The lowest sort_key across `table`'s whole key space, or null if empty.
	 *
	 * Reads through `tx` so a key derived inside a transaction sees that
	 * transaction's own writes rather than the pre-transaction snapshot.
	 */
	private async _minKey(
		table: OrderedTable,
		tx: DbDriver = this.db,
	): Promise<string | null> {
		const space = KEY_SPACE[table];
		const rows = await tx.select<{ sort_key: string | null }>(
			space
				.map(
					(t) =>
						`SELECT MIN(sort_key) AS sort_key FROM ${t} WHERE sort_key IS NOT NULL`,
				)
				.join(" UNION ALL "),
		);
		const keys = rows
			.map((r) => r.sort_key)
			.filter((k): k is string => typeof k === "string");
		if (keys.length === 0) return null;
		return keys.reduce((lowest, k) => (k < lowest ? k : lowest));
	}

	/**
	 * A key that sorts before every existing row of `table`'s key space.
	 *
	 * New rows go to the top: that is where the optimistic store already shows
	 * them, and disagreeing here makes a freshly created row jump on the next
	 * reload.
	 */
	private async _headKey(
		table: OrderedTable,
		tx: DbDriver = this.db,
	): Promise<string> {
		return generateKeyBetween(null, await this._minKey(table, tx));
	}

	/**
	 * `id`'s current sort_key, or null if no row in `table`'s key space has it.
	 *
	 * Feeds generateKeyBetween in moveTask/moveProject/moveProjectGroup: the new
	 * key is derived from the two neighbours the row was dropped between, not
	 * from any positional index. The lookup spans the whole key space because a
	 * top-level neighbour may be a group where the moved row is a project, or
	 * the other way round.
	 */
	private async _keyOf(
		table: OrderedTable,
		id: string,
		tx: DbDriver = this.db,
	): Promise<string | null> {
		const space = KEY_SPACE[table];
		const rows = await tx.select<{ sort_key: string | null }>(
			space
				.map((t) => `SELECT sort_key FROM ${t} WHERE id = ?`)
				.join(" UNION ALL "),
			space.map(() => id),
		);
		return rows.find((r) => typeof r.sort_key === "string")?.sort_key ?? null;
	}

	// ---------- Projects ----------

	async getProjects(): Promise<Project[]> {
		const rows = await this.db.select<ProjectRow>(
			"SELECT id, name, color, icon, sort_order, sort_key, group_id, created_at, updated_at FROM projects WHERE deleted_at IS NULL ORDER BY sort_key",
		);
		return rows.map(mapProject);
	}

	async createProject(input: CreateProjectInput): Promise<Project> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			// Derived inside the transaction: a key read from the outer connection
			// could be taken from a state another write has since moved on from.
			const sortKey = await this._headKey("projects", tx);
			await tx.execute(
				"INSERT INTO projects (id, name, color, icon, sort_order, sort_key, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
				[
					id,
					input.name,
					input.color ?? null,
					input.icon ?? null,
					sortKey,
					now,
					now,
				],
			);
			await this._stamp(
				"projects",
				id,
				["name", "color", "icon", "sort_key"],
				now,
				tx,
			);
		});
		const project = await this._getProject(id);
		if (!project) throw new Error(`Project not found after write: ${id}`);
		return project;
	}

	async updateProject(
		id: string,
		patch: Partial<CreateProjectInput>,
	): Promise<Project> {
		const now = new Date().toISOString();
		const sets: string[] = ["updated_at = ?"];
		const params: unknown[] = [now];
		const touched: string[] = [];
		if ("name" in patch) {
			sets.push("name = ?");
			params.push(patch.name);
			touched.push("name");
		}
		if ("color" in patch) {
			sets.push("color = ?");
			params.push(patch.color ?? null);
			touched.push("color");
		}
		if ("icon" in patch) {
			sets.push("icon = ?");
			params.push(patch.icon ?? null);
			touched.push("icon");
		}
		params.push(id);
		await this.db.transaction(async (tx) => {
			await tx.execute(
				`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`,
				params,
			);
			await this._stamp("projects", id, touched, now, tx);
		});
		const project = await this._getProject(id);
		if (!project) throw new Error(`Project not found after write: ${id}`);
		return project;
	}

	async deleteProject(id: string): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			const tags = await tx.select<{ id: string }>(
				"SELECT id FROM tags WHERE project_id = ?",
				[id],
			);
			await tx.execute(
				"DELETE FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE project_id = ?)",
				[id],
			);
			await tx.execute(
				"UPDATE tags SET deleted_at = ?, updated_at = ? WHERE project_id = ?",
				[now, now, id],
			);
			// The cascade blanks deleted_at on every tag under this project — each
			// one needs its own stamp, or the cascaded delete comes straight back
			// the moment another device pushes its own stale copy of that tag.
			for (const tag of tags) {
				await this._stamp("tags", tag.id, ["deleted_at"], now, tx);
			}
			await tx.execute(
				"UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?",
				[now, now, id],
			);
			await this._stamp("projects", id, ["deleted_at"], now, tx);
		});
	}

	private async _getProject(id: string): Promise<Project | null> {
		const rows = await this.db.select<ProjectRow>(
			"SELECT id, name, color, icon, sort_order, sort_key, group_id, created_at, updated_at FROM projects WHERE id = ? AND deleted_at IS NULL",
			[id],
		);
		return rows[0] ? mapProject(rows[0]) : null;
	}

	// ---------- Project Groups ----------

	async getProjectGroups(): Promise<ProjectGroup[]> {
		const rows = await this.db.select<ProjectGroupRow>(
			"SELECT id, name, color, sort_order, sort_key, created_at, updated_at FROM project_groups WHERE purged_at IS NULL ORDER BY sort_key",
		);
		return rows.map(mapProjectGroup);
	}

	async createProjectGroup(
		input: CreateProjectGroupInput,
	): Promise<ProjectGroup> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		// sort_order is a dead column: writing MAX(sort_order) + 1 here put the new
		// group last on that number line while its sort_key put it first, so the
		// group appeared in two different places depending on which one a reader
		// used. It is now written as 0, like every other create path.
		await this.db.transaction(async (tx) => {
			// Derived inside the transaction — see createProject.
			const sortKey = await this._headKey("project_groups", tx);
			await tx.execute(
				"INSERT INTO project_groups (id, name, color, sort_order, sort_key, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
				[id, input.name, input.color, sortKey, now, now],
			);
			await this._stamp(
				"project_groups",
				id,
				["name", "color", "sort_key"],
				now,
				tx,
			);
		});
		const group = await this._getProjectGroup(id);
		if (!group) throw new Error(`ProjectGroup not found after write: ${id}`);
		return group;
	}

	async updateProjectGroup(
		id: string,
		patch: Partial<Pick<ProjectGroup, "name" | "color">>,
	): Promise<ProjectGroup> {
		const now = new Date().toISOString();
		const sets: string[] = ["updated_at = ?"];
		const params: unknown[] = [now];
		const touched: string[] = [];
		if ("name" in patch) {
			sets.push("name = ?");
			params.push(patch.name);
			touched.push("name");
		}
		if ("color" in patch) {
			sets.push("color = ?");
			params.push(patch.color);
			touched.push("color");
		}
		params.push(id);
		await this.db.transaction(async (tx) => {
			await tx.execute(
				`UPDATE project_groups SET ${sets.join(", ")} WHERE id = ?`,
				params,
			);
			await this._stamp("project_groups", id, touched, now, tx);
		});
		const group = await this._getProjectGroup(id);
		if (!group) throw new Error(`ProjectGroup not found after write: ${id}`);
		return group;
	}

	async deleteProjectGroup(id: string): Promise<void> {
		const now = new Date().toISOString();
		// Collected before the UPDATE below clears group_id: afterwards no row
		// carries this id and the list to stamp would be empty.
		const detached = await this.db.select<{ id: string }>(
			"SELECT id FROM projects WHERE group_id = ?",
			[id],
		);
		// Both writes or neither: a tombstoned group whose projects still carry
		// its id renders a reference no reader can resolve. The tombstone write
		// goes first so a failure in the detach (the one this task's atomicity
		// test injects) has something to roll back — reversed, the tombstone
		// would already be durable by the time the detach failed.
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE project_groups SET purged_at = ?, updated_at = ?, name = '' WHERE id = ?",
				[now, now, id],
			);
			await tx.execute(
				"UPDATE projects SET group_id = NULL, updated_at = ? WHERE group_id = ?",
				[now, id],
			);
			await this._stamp("project_groups", id, ["purged_at", "name"], now, tx);
			for (const project of detached) {
				await this._stamp("projects", project.id, ["group_id"], now, tx);
			}
		});
	}

	/**
	 * Place `id` between two neighbours, identified by the rows the user dropped
	 * it between. Either may be null at the ends of the list.
	 *
	 * One row is written, not N — see moveTask, which this mirrors. The method
	 * this replaces wrote only sort_order; now that getProjects reads sort_key,
	 * leaving that unconverted would make the sidebar reorder a silent no-op.
	 */
	async moveProject(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			// The neighbours are read inside the transaction that writes between
			// them, so the key cannot be derived from an order already superseded.
			const prevKey = prevId ? await this._keyOf("projects", prevId, tx) : null;
			const nextKey = nextId ? await this._keyOf("projects", nextId, tx) : null;
			const key = generateKeyBetween(prevKey, nextKey);
			await tx.execute(
				"UPDATE projects SET sort_key = ?, updated_at = ? WHERE id = ?",
				[key, now, id],
			);
			await this._stamp("projects", id, ["sort_key"], now, tx);
		});
	}

	/** Mirrors moveProject, for the same reason: see its comment. */
	async moveProjectGroup(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			const prevKey = prevId
				? await this._keyOf("project_groups", prevId, tx)
				: null;
			const nextKey = nextId
				? await this._keyOf("project_groups", nextId, tx)
				: null;
			const key = generateKeyBetween(prevKey, nextKey);
			await tx.execute(
				"UPDATE project_groups SET sort_key = ?, updated_at = ? WHERE id = ?",
				[key, now, id],
			);
			await this._stamp("project_groups", id, ["sort_key"], now, tx);
		});
	}

	async assignProjectToGroup(
		projectId: string,
		groupId: string | null,
	): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE projects SET group_id = ?, updated_at = ? WHERE id = ?",
				[groupId, now, projectId],
			);
			await this._stamp("projects", projectId, ["group_id"], now, tx);
		});
	}

	private async _getProjectGroup(id: string): Promise<ProjectGroup | null> {
		const rows = await this.db.select<ProjectGroupRow>(
			"SELECT id, name, color, sort_order, sort_key, created_at, updated_at FROM project_groups WHERE id = ?",
			[id],
		);
		return rows[0] ? mapProjectGroup(rows[0]) : null;
	}

	// ---------- Tags ----------

	async getTags(projectId?: string | null): Promise<Tag[]> {
		if (projectId === null) {
			const rows = await this.db.select<TagRow>(
				"SELECT id, name, color, project_id FROM tags WHERE deleted_at IS NULL AND project_id IS NULL ORDER BY name",
			);
			return rows.map(mapTag);
		}
		if (projectId !== undefined) {
			const rows = await this.db.select<TagRow>(
				"SELECT id, name, color, project_id FROM tags WHERE deleted_at IS NULL AND (project_id = ? OR project_id IS NULL) ORDER BY name",
				[projectId],
			);
			return rows.map(mapTag);
		}
		const rows = await this.db.select<TagRow>(
			"SELECT id, name, color, project_id FROM tags WHERE deleted_at IS NULL ORDER BY name",
		);
		return rows.map(mapTag);
	}

	async createTag(input: CreateTagInput): Promise<Tag> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"INSERT INTO tags (id, name, color, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				[
					id,
					input.name,
					input.color ?? null,
					input.projectId ?? null,
					now,
					now,
				],
			);
			await this._stamp("tags", id, ["name", "color", "project_id"], now, tx);
		});
		const tag = await this._getTag(id);
		if (!tag) throw new Error(`Tag not found after write: ${id}`);
		return tag;
	}

	async updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag> {
		const now = new Date().toISOString();
		const sets: string[] = ["updated_at = ?"];
		const params: unknown[] = [now];
		const touched: string[] = [];
		if ("name" in patch) {
			sets.push("name = ?");
			params.push(patch.name);
			touched.push("name");
		}
		if ("color" in patch) {
			sets.push("color = ?");
			params.push(patch.color ?? null);
			touched.push("color");
		}
		if ("projectId" in patch) {
			sets.push("project_id = ?");
			params.push(patch.projectId ?? null);
			touched.push("project_id");
		}
		params.push(id);
		await this.db.transaction(async (tx) => {
			await tx.execute(
				`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`,
				params,
			);
			await this._stamp("tags", id, touched, now, tx);
		});
		const tag = await this._getTag(id);
		if (!tag) throw new Error(`Tag not found after write: ${id}`);
		return tag;
	}

	async deleteTag(id: string): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?",
				[now, now, id],
			);
			await this._stamp("tags", id, ["deleted_at"], now, tx);
		});
	}

	private async _getTag(id: string): Promise<Tag | null> {
		const rows = await this.db.select<TagRow>(
			"SELECT id, name, color, project_id FROM tags WHERE id = ? AND deleted_at IS NULL",
			[id],
		);
		return rows[0] ? mapTag(rows[0]) : null;
	}

	async isTagUsedInProjectTasks(tagId: string): Promise<boolean> {
		const rows = await this.db.select<{ count: number }>(
			`SELECT COUNT(*) as count FROM task_tags tt
			 JOIN tasks t ON t.id = tt.task_id
			 WHERE tt.tag_id = ? AND t.project_id IS NOT NULL AND t.deleted_at IS NULL AND t.purged_at IS NULL`,
			[tagId],
		);
		return (rows[0]?.count ?? 0) > 0;
	}

	// ---------- Tasks ----------

	async getTasks(filters?: TaskFilters): Promise<Task[]> {
		const conditions: string[] = [
			"t.deleted_at IS NULL",
			"t.purged_at IS NULL",
		];
		const params: unknown[] = [];

		if (filters?.projectId === null) {
			conditions.push("t.project_id IS NULL");
		} else if (filters?.projectId !== undefined) {
			conditions.push("t.project_id = ?");
			params.push(filters.projectId);
		}

		const projectIdsFilter = buildProjectIdsCondition(filters?.projectIds);
		if (projectIdsFilter) {
			conditions.push(projectIdsFilter.clause);
			params.push(...projectIdsFilter.params);
		}

		if (filters?.priority) {
			conditions.push("t.priority = ?");
			params.push(filters.priority);
		}

		if (filters?.allTasks) {
			// no completion filter — return all tasks
		} else if (filters?.completed === true) {
			conditions.push("t.completed_at IS NOT NULL");
		} else {
			conditions.push(
				"(t.completed_at IS NULL OR date(t.completed_at, 'localtime') >= date('now', 'localtime'))",
			);
		}

		if (filters?.dueBefore) {
			conditions.push("t.due_date <= ?");
			params.push(filters.dueBefore);
		}

		let sql = `SELECT t.id, t.title, t.description, t.project_id, t.priority, t.due_date, t.completed_at, t.deleted_at, t.sort_order, t.created_at, t.updated_at FROM tasks t WHERE ${conditions.join(" AND ")} ORDER BY t.sort_key`;

		if (filters?.tagIds && filters.tagIds.length > 0) {
			const placeholders = filters.tagIds.map(() => "?").join(", ");
			sql = `SELECT DISTINCT t.id, t.title, t.description, t.project_id, t.priority, t.due_date, t.completed_at, t.deleted_at, t.sort_order, t.created_at, t.updated_at FROM tasks t INNER JOIN task_tags tt ON tt.task_id = t.id WHERE ${conditions.join(" AND ")} AND tt.tag_id IN (${placeholders}) ORDER BY t.sort_key`;
			params.push(...filters.tagIds);
		}

		const taskRows = await this.db.select<TaskRow>(sql, params);
		if (taskRows.length === 0) return [];
		return this._attachTags(taskRows);
	}

	async getTask(id: string): Promise<Task | null> {
		const rows = await this.db.select<TaskRow>(
			"SELECT id, title, description, project_id, priority, due_date, completed_at, deleted_at, sort_order, created_at, updated_at FROM tasks WHERE id = ? AND deleted_at IS NULL AND purged_at IS NULL",
			[id],
		);
		if (!rows[0]) return null;
		const withTags = await this._attachTags([rows[0]]);
		return withTags[0];
	}

	async createTask(input: CreateTaskInput): Promise<Task> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const sortKey = await this._headKey("tasks");
		const deviceId = await getOrCreateDeviceId(this.db);
		const stamped = stampFields(
			null,
			[
				"title",
				"description",
				"project_id",
				"priority",
				"due_date",
				"tags",
				"sort_key",
			],
			now,
			deviceId,
		);
		await this.db.execute(
			"INSERT INTO tasks (id, title, description, project_id, priority, due_date, sort_order, sort_key, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
			[
				id,
				input.title,
				input.description ?? null,
				input.projectId ?? null,
				input.priority ?? "none",
				input.dueDate ?? null,
				sortKey,
				now,
				now,
				stamped,
			],
		);
		if (input.tagIds && input.tagIds.length > 0) {
			for (const tagId of input.tagIds) {
				await this.db.execute(
					"INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)",
					[id, tagId],
				);
			}
		}
		const task = await this.getTask(id);
		if (!task) throw new Error(`Task not found after write: ${id}`);
		return task;
	}

	async updateTask(id: string, patch: Partial<CreateTaskInput>): Promise<Task> {
		const now = new Date().toISOString();
		const sets: string[] = ["updated_at = ?"];
		const params: unknown[] = [now];
		if ("title" in patch) {
			sets.push("title = ?");
			params.push(patch.title);
		}
		if ("description" in patch) {
			sets.push("description = ?");
			params.push(patch.description ?? null);
		}
		if ("projectId" in patch) {
			sets.push("project_id = ?");
			params.push(patch.projectId ?? null);
		}
		if ("priority" in patch) {
			sets.push("priority = ?");
			params.push(patch.priority);
		}
		if ("dueDate" in patch) {
			sets.push("due_date = ?");
			params.push(patch.dueDate ?? null);
		}

		const touched: string[] = [];
		if ("title" in patch) touched.push("title");
		if ("description" in patch) touched.push("description");
		if ("projectId" in patch) touched.push("project_id");
		if ("priority" in patch) touched.push("priority");
		if ("dueDate" in patch) touched.push("due_date");
		if ("tagIds" in patch) touched.push("tags");

		const prior = await this.db.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[id],
		);
		const deviceId = await getOrCreateDeviceId(this.db);
		sets.push("field_updated_at = ?");
		params.push(
			stampFields(prior[0]?.field_updated_at ?? null, touched, now, deviceId),
		);

		params.push(id);
		await this.db.execute(
			`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
			params,
		);
		if ("tagIds" in patch && patch.tagIds !== undefined) {
			await this.db.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
			for (const tagId of patch.tagIds) {
				await this.db.execute(
					"INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)",
					[id, tagId],
				);
			}
		}
		const updated = await this.getTask(id);
		if (!updated) throw new Error(`Task not found after write: ${id}`);
		return updated;
	}

	async moveTasksToProject(
		taskIds: string[],
		projectId: string | null,
	): Promise<void> {
		if (taskIds.length === 0) return;
		const now = new Date().toISOString();
		// One transaction for the whole batch, not one per task: transactions do
		// not nest here, and a half-applied move is not a state the merge engine
		// should ever have to reconcile.
		await this.db.transaction(async (tx) => {
			for (const id of taskIds) {
				await tx.execute(
					"UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?",
					[projectId, now, id],
				);
				await this._stamp("tasks", id, ["project_id"], now, tx);
			}
		});
	}

	async completeTask(id: string): Promise<Task> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?",
				[now, now, id],
			);
			await this._stamp("tasks", id, ["completed_at"], now, tx);
		});
		const completed = await this.getTask(id);
		if (!completed) throw new Error(`Task not found after write: ${id}`);
		return completed;
	}

	async uncompleteTask(id: string): Promise<Task> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE tasks SET completed_at = NULL, updated_at = ? WHERE id = ?",
				[now, id],
			);
			await this._stamp("tasks", id, ["completed_at"], now, tx);
		});
		const uncompleted = await this.getTask(id);
		if (!uncompleted) throw new Error(`Task not found after write: ${id}`);
		return uncompleted;
	}

	async archiveTask(id: string): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?",
				[now, now, id],
			);
			await this._stamp("tasks", id, ["deleted_at"], now, tx);
		});
	}

	async deleteTask(id: string): Promise<void> {
		const now = new Date().toISOString();
		// Keep the row as a tombstone so the deletion can propagate; blank the
		// content so a purged task leaks nothing once synced. Also stamp
		// deleted_at: it is not because the row is "archived", but so a client
		// rolled back to a release that predates purged_at still filters this
		// row out of the active list (deleted_at IS NULL) and only surfaces it
		// under Archives instead of resurrecting it as a blank-titled phantom.
		await this.db.transaction(async (tx) => {
			await tx.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
			await tx.execute(
				"UPDATE tasks SET purged_at = ?, deleted_at = ?, updated_at = ?, title = '', description = NULL WHERE id = ?",
				[now, now, now, id],
			);
			await this._stamp(
				"tasks",
				id,
				["purged_at", "deleted_at", "title", "description"],
				now,
				tx,
			);
		});
	}

	async unarchiveTask(id: string): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			await tx.execute(
				"UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?",
				[now, id],
			);
			await this._stamp("tasks", id, ["deleted_at"], now, tx);
		});
	}

	async getArchivedTasks(): Promise<Task[]> {
		const taskRows = await this.db.select<TaskRow>(
			"SELECT id, title, description, project_id, priority, due_date, completed_at, sort_order, created_at, updated_at, deleted_at FROM tasks WHERE deleted_at IS NOT NULL AND purged_at IS NULL ORDER BY deleted_at DESC",
		);
		if (taskRows.length === 0) return [];
		return this._attachTags(taskRows);
	}

	/**
	 * Place `id` between two neighbours, identified by the rows the user dropped
	 * it between. Either may be null at the ends of the list.
	 *
	 * One row is written, not N. The method this replaces renumbered the whole
	 * displayed subset to 0..N-1, which collided with every row the current
	 * filter happened to hide — see spec §9.1.
	 */
	async moveTask(
		id: string,
		prevId: string | null,
		nextId: string | null,
	): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			const prevKey = prevId ? await this._keyOf("tasks", prevId, tx) : null;
			const nextKey = nextId ? await this._keyOf("tasks", nextId, tx) : null;
			const key = generateKeyBetween(prevKey, nextKey);
			await tx.execute(
				"UPDATE tasks SET sort_key = ?, updated_at = ? WHERE id = ?",
				[key, now, id],
			);
			await this._stamp("tasks", id, ["sort_key"], now, tx);
		});
	}

	// ---------- Settings ----------

	async getSettings(): Promise<Record<string, string>> {
		const rows = await this.db.select<{ key: string; value: string }>(
			"SELECT key, value FROM settings",
		);
		return Object.fromEntries(rows.map((r) => [r.key, r.value]));
	}

	async setSetting(key: string, value: string): Promise<void> {
		await this.db.execute(
			"INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
			[key, value],
		);
	}

	/**
	 * What `bulkImport` would have to change about this payload to fit the rows
	 * this device holds — without writing anything.
	 *
	 * The import dialog needs this *before* the transaction: landing tasks in the
	 * Inbox is a defensible answer to a project that is not here, but only if the
	 * user is told, and afterwards is too late. See `import-resolution.ts`.
	 */
	async previewImport(
		data: ExportData,
		strategy: "merge" | "replace",
	): Promise<ImportGaps> {
		const projects = await this.db.select<{ id: string }>(
			"SELECT id FROM projects WHERE purged_at IS NULL",
		);
		const tags = await this.db.select<{ id: string; name: string }>(
			"SELECT id, name FROM tags WHERE purged_at IS NULL",
		);
		return countImportGaps(
			data,
			predictReferents(
				data,
				{ projectIds: projects.map((r) => r.id), tags },
				strategy,
			),
		);
	}

	/**
	 * An import is a bulk local edit that propagates, not a silent restore: every
	 * row it writes is stamped as changed now by this device, so the outbox
	 * pushes it like any other write (spec §9.4).
	 *
	 * In `replace` mode, local rows absent from the backup are tombstoned, not
	 * physically deleted — a DELETE fires the outbox trigger on a row that no
	 * longer exists, leaving the merge engine unable to tell "purged" from
	 * "never existed", so the deletion never reaches the other devices. That
	 * defeats the entire point of a replace import.
	 *
	 * One consequence is intended, not a bug: restoring a backup older than a
	 * deletion resurrects that row everywhere, in both strategies. The
	 * confirmation dialog that makes this consented is a later task.
	 *
	 * The whole import is one transaction: a partial import would leave some
	 * rows stamped-and-pushable and others not, a state the merge engine has no
	 * way to reconcile.
	 *
	 * See IMPORT_STAMPED_FIELDS for why the columns OR REPLACE *resets* are
	 * stamped alongside the ones it writes.
	 */
	async bulkImport(
		data: ExportData,
		strategy: "merge" | "replace",
	): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async (tx) => {
			const deviceId = await getOrCreateDeviceId(tx);

			if (strategy === "replace") {
				await this._tombstoneAbsent("tasks", data.tasks, now, tx);
				await this._tombstoneAbsent("tags", data.tags, now, tx);
				await this._tombstoneAbsent("projects", data.projects, now, tx);
				// task_tags carries no sync identity of its own (spec §1.5): rows
				// pointing at a tag/task not in the backup are just dropped.
				await tx.execute("DELETE FROM task_tags", []);
			}

			// One block of keys above the current head, assigned in payload order.
			// Deriving a head key per row instead put each row above the previous
			// one, so an import came back in exactly the reverse of the order it was
			// exported in. It also ran a MIN(sort_key) per row inside the transaction.
			const projectKeys = generateNKeysBetween(
				null,
				await this._minKey("projects", tx),
				data.projects.length,
			);

			// group_id used to be absent from the column list, so OR REPLACE
			// silently ungrouped every colliding project.
			//
			// ExportData carries no project_groups array, so on a fresh install or a
			// second machine the group a project names simply is not there, and
			// projects.group_id REFERENCES project_groups(id). OR REPLACE does not
			// resolve a foreign key violation, and the import is one transaction, so
			// one such project aborted the entire restore and the dialog reported a
			// valid backup as corrupt. Ungroup those projects instead; group_id is in
			// IMPORT_STAMPED_FIELDS.projects, so the NULL propagates as a real change
			// rather than losing to any remote value on the first sync.
			const localGroupIds = new Set(
				(await tx.select<{ id: string }>("SELECT id FROM project_groups")).map(
					(r) => r.id,
				),
			);
			const priorProjectStamps = await this._priorStamps("projects", tx);
			for (const [index, p] of data.projects.entries()) {
				await tx.execute(
					"INSERT OR REPLACE INTO projects (id, name, color, icon, group_id, sort_order, sort_key, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					[
						p.id,
						p.name,
						p.color,
						p.icon,
						p.groupId !== null && localGroupIds.has(p.groupId)
							? p.groupId
							: null,
						p.sortOrder,
						projectKeys[index],
						p.createdAt,
						p.updatedAt,
						stampFields(
							priorProjectStamps.get(p.id) ?? null,
							[...IMPORT_STAMPED_FIELDS.projects],
							now,
							deviceId,
						),
					],
				);
			}

			// A task or a tag may name a project this device does not have:
			// dataTransfer.ts exports tasks carrying projectId while sending
			// `projects: []` whenever the "projects" checkbox is unchecked. Both
			// tasks.project_id (001_initial.sql) and tags.project_id
			// (004_tags_project_scope.sql) REFERENCE projects(id), so one such row
			// aborted the entire restore exactly as a missing group did.
			//
			// Resolving here rather than at export time is what lets the same
			// tasks-only backup restore intact onto the device it came from and
			// degrade only where the project is genuinely gone.
			//
			// Read after the loop above, so a project the payload carries itself
			// counts, and excluding purged rows: a tombstone still satisfies the
			// foreign key, so a replace that tombstones a project would otherwise
			// leave its tasks hanging off a row no sidebar ever lists.
			const liveProjectIds = new Set(
				(
					await tx.select<{ id: string }>(
						"SELECT id FROM projects WHERE purged_at IS NULL",
					)
				).map((r) => r.id),
			);
			const inProject = (id: string | null): string | null =>
				resolveProjectRef(id, liveProjectIds);

			// In merge mode use OR IGNORE to avoid overwriting existing tags that share
			// the same UNIQUE(name) — which would delete the existing row and orphan its task_tags.
			const tagSql =
				strategy === "merge"
					? "INSERT OR IGNORE INTO tags (id, name, color, project_id, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
					: "INSERT OR REPLACE INTO tags (id, name, color, project_id, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
			const priorTagStamps = await this._priorStamps("tags", tx);
			for (const tag of data.tags) {
				await tx.execute(tagSql, [
					tag.id,
					tag.name,
					tag.color,
					inProject(tag.projectId),
					data.exportedAt,
					data.exportedAt,
					stampFields(
						priorTagStamps.get(tag.id) ?? null,
						[...IMPORT_STAMPED_FIELDS.tags],
						now,
						deviceId,
					),
				]);
			}

			// task_tags.tag_id is NOT NULL REFERENCES tags(id) (001_initial.sql) and
			// the tag a task names may not be in the table at all: "tags" unchecked
			// sends `tags: []`, and — far more often — tags.name is globally UNIQUE,
			// so the OR IGNORE above keeps the local row and never inserts the
			// payload's id. Either way the link aborted the whole import.
			//
			// That OR IGNORE already decided the local tag wins a name collision;
			// pointing the link at it finishes that decision rather than crashing on
			// it, and UNIQUE(name) guarantees at most one candidate. Only a tag with
			// no local counterpart at all loses its link — which also covers the
			// replace case the removed `exportedTagIds` set used to special-case,
			// since a tag left out of a replace import is tombstoned, and a
			// tombstone satisfies the foreign key without being a tag any more.
			const liveTags = await tx.select<{ id: string; name: string }>(
				"SELECT id, name FROM tags WHERE purged_at IS NULL",
			);
			const liveTagIds = new Set(liveTags.map((r) => r.id));
			const liveTagIdByName = new Map(liveTags.map((r) => [r.name, r.id]));
			const linkTo = (t: Tag): string | null =>
				resolveTagLink(t, {
					tagIds: liveTagIds,
					tagIdByName: liveTagIdByName,
				});

			// Same block-of-keys reasoning as the projects loop above.
			const taskKeys = generateNKeysBetween(
				null,
				await this._minKey("tasks", tx),
				data.tasks.length,
			);

			const priorTaskStamps = await this._priorStamps("tasks", tx);
			for (const [index, task] of data.tasks.entries()) {
				await tx.execute(
					"INSERT OR REPLACE INTO tasks (id, title, description, project_id, priority, due_date, completed_at, deleted_at, sort_order, sort_key, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					[
						task.id,
						task.title,
						task.description,
						inProject(task.projectId),
						task.priority,
						task.dueDate,
						task.completedAt,
						task.deletedAt,
						task.sortOrder,
						taskKeys[index],
						task.createdAt,
						task.updatedAt,
						stampFields(
							priorTaskStamps.get(task.id) ?? null,
							[...IMPORT_STAMPED_FIELDS.tasks],
							now,
							deviceId,
						),
					],
				);
				await tx.execute("DELETE FROM task_tags WHERE task_id = ?", [task.id]);
				for (const tag of task.tags) {
					const tagId = linkTo(tag);
					if (tagId === null) continue;
					await tx.execute(
						"INSERT OR REPLACE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
						[task.id, tagId],
					);
				}
			}
		});
	}

	/**
	 * Tombstone every row of `table` absent from the imported set, instead of
	 * deleting it — see bulkImport's doc comment for why.
	 *
	 * `deleted_at` is stamped alongside `purged_at`, mirroring deleteTask: a
	 * client rolled back to a release that predates purged_at still filters
	 * this row out via `deleted_at IS NULL` instead of resurrecting it blank.
	 *
	 * `WHERE purged_at IS NULL` guards against re-stamping rows already
	 * tombstoned: without it, every import would re-push every old tombstone.
	 * Tombstoning is by id, so an already-absent row (deleted, not tombstoned,
	 * before sync existed) simply matches nothing — nothing to generate.
	 */
	private async _tombstoneAbsent(
		table: "tasks" | "tags" | "projects",
		kept: Array<{ id: string }>,
		now: string,
		tx: DbDriver,
	): Promise<void> {
		// The absent set is computed in memory rather than with a NOT IN over the
		// kept ids: binding one variable per kept id put a ceiling of roughly
		// SQLITE_MAX_VARIABLE_NUMBER on how large a backup could be imported, and
		// a restore is exactly when the payload is at its largest.
		const keptIds = new Set(kept.map((r) => r.id));
		// tags.name is NOT NULL UNIQUE (001_initial.sql), so blanking a second
		// tombstone to the same '' collided and aborted the whole import — any
		// replace import leaving two tags out of the backup. The id is unique by
		// construction and carries no user content, which is all blanking is for.
		const blank =
			table === "tasks"
				? ", title = '', description = NULL"
				: table === "tags"
					? ", name = id"
					: ", name = ''";
		const live = await tx.select<{ id: string }>(
			`SELECT id FROM ${table} WHERE purged_at IS NULL`,
		);
		const rows = live.filter((r) => !keptIds.has(r.id));
		if (rows.length === 0) return;
		for (let i = 0; i < rows.length; i += ID_CHUNK_SIZE) {
			const ids = rows.slice(i, i + ID_CHUNK_SIZE).map((r) => r.id);
			await tx.execute(
				`UPDATE ${table} SET purged_at = ?, deleted_at = ?, updated_at = ?${blank} WHERE purged_at IS NULL AND id IN (${ids.map(() => "?").join(", ")})`,
				[now, now, now, ...ids],
			);
		}
		for (const row of rows) {
			const fields =
				table === "tasks"
					? ["purged_at", "deleted_at", "title", "description"]
					: ["purged_at", "deleted_at", "name"];
			await this._stamp(table, row.id, fields, now, tx);
		}
	}

	private async _attachTags(taskRows: TaskRow[]): Promise<Task[]> {
		if (taskRows.length === 0) return [];
		const ids = taskRows.map((r) => r.id);
		const placeholders = ids.map(() => "?").join(", ");
		const tagRows = await this.db.select<TaskTagRow>(
			`SELECT tt.task_id, t.id as tag_id, t.name, t.color, t.project_id FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE t.deleted_at IS NULL AND tt.task_id IN (${placeholders})`,
			ids,
		);
		const byTaskId = new Map<string, Tag[]>();
		for (const row of tagRows) {
			if (!byTaskId.has(row.task_id)) byTaskId.set(row.task_id, []);
			byTaskId.get(row.task_id)?.push({
				id: row.tag_id,
				name: row.name,
				color: row.color,
				projectId: row.project_id,
			});
		}
		return taskRows.map((row) => mapTask(row, byTaskId.get(row.id) ?? []));
	}
}
