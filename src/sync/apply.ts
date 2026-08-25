import type { DbDriver } from "@/db/driver";
import { stampFields } from "@/db/field-timestamps";
import { nowIso } from "@/lib/sync-clock";
import { payloadToWrite, UNLINKED_TAGS_KEY } from "./payload";
import {
	ENTITY_TABLE,
	type PulledRecord,
	type SyncEntityType,
	type SyncPayload,
} from "./types";

export async function liveTagIds(db: DbDriver): Promise<Set<string>> {
	const rows = await db.select<{ id: string }>(
		"SELECT id FROM tags WHERE purged_at IS NULL",
	);
	return new Set(rows.map((r) => r.id));
}

export async function clearOutbox(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	await tx.execute(
		"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ?",
		[entityType, id],
	);
}

export async function touchOutbox(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	await tx.execute(
		"INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at) VALUES (?, ?, ?)",
		[entityType, id, nowIso()],
	);
}

export async function quarantinePull(
	tx: DbDriver,
	record: PulledRecord,
	reason: string,
): Promise<void> {
	await tx.execute(
		`INSERT OR REPLACE INTO sync_quarantine
		 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
		 VALUES (?, ?, ?, 'pull', ?, ?, ?, ?)`,
		[
			record.entityType,
			record.id,
			record.seq,
			record.ciphertext,
			record.nonce,
			reason,
			nowIso(),
		],
	);
}

export async function quarantinePushTooLarge(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	// No blob to keep: the record itself lives in its table; what is parked is
	// the fact that it cannot be pushed (server bound: 64 KiB of ciphertext).
	await tx.execute(
		`INSERT OR REPLACE INTO sync_quarantine
		 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
		 VALUES (?, ?, NULL, 'push', NULL, NULL, 'payload-too-large', ?)`,
		[entityType, id, nowIso()],
	);
}

/** Upserts the merged payload without touching non-synced columns (sort_order). */
export async function upsertMerged(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
	payload: SyncPayload,
): Promise<void> {
	const table = ENTITY_TABLE[entityType];
	const linkable =
		entityType === "task" ? await liveTagIds(tx) : new Set<string>();
	const write = payloadToWrite(entityType, payload, linkable);
	const cols: Record<string, unknown> = {
		...write.columns,
		updated_at: nowIso(),
		field_updated_at: write.stamps,
		sync_extra: write.extra,
		// Only live remotes reach this function (tombstones and the local
		// purge-terminal guard are handled upstream), so the row is live.
		purged_at: null,
	};
	const names = Object.keys(cols);
	// UPDATE-first, INSERT-on-miss, never INSERT OR REPLACE and never a single
	// INSERT … ON CONFLICT DO UPDATE: OR REPLACE is DELETE-then-INSERT in
	// SQLite — it would fire the DELETE trigger and reset every column left out
	// of the statement (sort_order, and whatever a future migration adds). The
	// upsert form has its own trap: when its DO UPDATE branch fires the table's
	// AFTER UPDATE trigger, that trigger's own INSERT OR REPLACE into
	// sync_outbox raises a UNIQUE violation the upsert does not resolve, even
	// though a plain UPDATE hitting the identical trigger never does — verified
	// against better-sqlite3 (bundled SQLite 3.53.4). Splitting into two
	// statements sidesteps that path entirely while still firing the right
	// trigger (UPDATE on a hit, INSERT on a miss) and leaving unlisted columns
	// alone either way.
	const updateSet = names.map((n) => `${n} = ?`).join(", ");
	const updateResult = await tx.execute(
		`UPDATE ${table} SET ${updateSet} WHERE id = ?`,
		[...names.map((n) => cols[n]), id],
	);
	if (updateResult.rowsAffected === 0) {
		await tx.execute(
			`INSERT INTO ${table} (id, ${names.join(", ")}) VALUES (?, ${names.map(() => "?").join(", ")})`,
			[id, ...names.map((n) => cols[n])],
		);
	}
	if (entityType === "task") {
		await tx.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
		for (const tagId of write.tagIds) {
			await tx.execute(
				"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
				[id, tagId],
			);
		}
	}
}

/** Column resets a purge applies, mirroring deleteTask / deleteProjectGroup. */
function tombstoneResets(entityType: SyncEntityType, id: string): string {
	switch (entityType) {
		case "task":
			return "title = '', description = NULL";
		case "tag":
			// tags.name is globally UNIQUE and NOT NULL; the id is unique by
			// construction, so renaming the tombstone to it frees the name for
			// any future live tag without ever colliding with another tombstone.
			return `name = '${id.replace(/'/g, "''")}'`;
		case "project":
		case "project_group":
			return "name = ''";
	}
}

export async function applyRemoteTombstone(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<void> {
	const table = ENTITY_TABLE[entityType];
	const now = nowIso();
	const existing = await tx.select<{ id: string }>(
		`SELECT id FROM ${table} WHERE id = ?`,
		[id],
	);
	if (existing.length === 0) {
		// The row must exist as a tombstone: "purged" and "never existed" are
		// different answers when a stale live version of it arrives later.
		const name = entityType === "tag" ? id : "";
		if (entityType === "task") {
			await tx.execute(
				`INSERT INTO tasks (id, title, created_at, updated_at, deleted_at, purged_at, field_updated_at)
				 VALUES (?, '', ?, ?, ?, ?, '{}')`,
				[id, now, now, now, now],
			);
		} else if (entityType === "project_group") {
			await tx.execute(
				`INSERT INTO project_groups (id, name, color, created_at, updated_at, purged_at, field_updated_at)
				 VALUES (?, ?, '', ?, ?, ?, '{}')`,
				[id, name, now, now, now],
			);
		} else {
			await tx.execute(
				`INSERT INTO ${table} (id, name, created_at, updated_at, purged_at, field_updated_at)
				 VALUES (?, ?, ?, ?, ?, '{}')`,
				[id, name, now, now, now],
			);
		}
	} else {
		// Purge is terminal (§5.2): local edits, however fresh, are discarded.
		const deletedAt = entityType === "task" ? ", deleted_at = ?" : "";
		await tx.execute(
			`UPDATE ${table} SET purged_at = ?, updated_at = ?${deletedAt}, ${tombstoneResets(entityType, id)} WHERE id = ?`,
			entityType === "task" ? [now, now, now, id] : [now, now, id],
		);
	}
	if (entityType === "task") {
		await tx.execute("DELETE FROM task_tags WHERE task_id = ?", [id]);
	}
	if (entityType === "tag") {
		await tx.execute("DELETE FROM task_tags WHERE tag_id = ?", [id]);
	}
	// Both sides now agree on the tombstone: nothing of it is left to push.
	await clearOutbox(tx, entityType, id);
}

/**
 * Writes the losing remote tag id as a LOCAL tombstone and arms the outbox:
 * purge is terminal, so pushing it back is what makes the other device drop
 * its duplicate. Used when the local tag wins the name collision.
 */
export async function writeLocalTombstone(
	tx: DbDriver,
	entityType: SyncEntityType,
	id: string,
	deviceId: string,
): Promise<void> {
	await applyRemoteTombstone(tx, entityType, id);
	const now = nowIso();
	await tx.execute(
		`UPDATE ${ENTITY_TABLE[entityType]} SET field_updated_at = ? WHERE id = ?`,
		[stampFields(null, ["purged_at", "name"], now, deviceId), id],
	);
	await touchOutbox(tx, entityType, id);
}

/**
 * tags.name is globally UNIQUE (migration 001): two devices creating the same
 * name offline collide at apply time. Deterministic rule — the SMALLER id
 * wins — so every device resolves the same collision the same way without
 * coordination. Outbox ordering (dirtied_at) guarantees a live tag always
 * arrives before the tombstone of its duplicate, so task assignments survive
 * through the remap below.
 */
export async function resolveTagNameCollision(
	tx: DbDriver,
	remoteId: string,
	remoteName: string,
	deviceId: string,
): Promise<"apply-live" | "keep-local"> {
	// A purged tag squatting the name would break the upsert's UNIQUE: free it.
	const squatters = await tx.select<{ id: string }>(
		"SELECT id FROM tags WHERE name = ? AND id != ? AND purged_at IS NOT NULL",
		[remoteName, remoteId],
	);
	for (const squatter of squatters) {
		await tx.execute("UPDATE tags SET name = ? WHERE id = ?", [
			squatter.id,
			squatter.id,
		]);
	}

	const rivals = await tx.select<{
		id: string;
		field_updated_at: string | null;
	}>(
		"SELECT id, field_updated_at FROM tags WHERE name = ? AND id != ? AND purged_at IS NULL",
		[remoteName, remoteId],
	);
	const rival = rivals[0];
	if (!rival) return "apply-live";
	if (rival.id < remoteId) return "keep-local";

	// Remote wins: purge the local duplicate and remap its links.
	const now = nowIso();
	await tx.execute(
		"UPDATE tags SET purged_at = ?, updated_at = ?, name = ?, field_updated_at = ? WHERE id = ?",
		[
			now,
			now,
			rival.id,
			stampFields(rival.field_updated_at, ["purged_at", "name"], now, deviceId),
			rival.id,
		],
	);
	await touchOutbox(tx, "tag", rival.id);
	// The winner's row does not exist yet (upsertMerged runs after this
	// resolution) and task_tags.tag_id is a foreign key: give the remap below a
	// row to point at. The rival's rename just freed the name, and OR IGNORE
	// no-ops when the remote tag already exists under another name. upsertMerged
	// then overwrites this stub with the real payload, and the INSERT trigger's
	// outbox entry is cleared there when nothing local survived the merge.
	await tx.execute(
		"INSERT OR IGNORE INTO tags (id, name, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, '{}')",
		[remoteId, remoteName, now, now],
	);
	const linked = await tx.select<{ task_id: string }>(
		"SELECT task_id FROM task_tags WHERE tag_id = ?",
		[rival.id],
	);
	for (const { task_id } of linked) {
		await tx.execute(
			"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
			[task_id, remoteId],
		);
		await tx.execute("DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?", [
			task_id,
			rival.id,
		]);
		// The tags field of the task genuinely changed: stamp it so it wins LWW
		// against the stale assignment and propagates (the UPDATE arms the outbox).
		const rows = await tx.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[task_id],
		);
		await tx.execute(
			"UPDATE tasks SET field_updated_at = ?, updated_at = ? WHERE id = ?",
			[
				stampFields(rows[0]?.field_updated_at ?? null, ["tags"], now, deviceId),
				now,
				task_id,
			],
		);
	}
	return "apply-live";
}

/** End-of-cycle §5.3: reattach dangling references — a real, propagating edit. */
export async function repairOrphans(
	tx: DbDriver,
	deviceId: string,
): Promise<void> {
	const now = nowIso();
	// A referent is gone once purged — and, for projects, once archived too:
	// deleteProject only sets deleted_at (there is no purge path and no
	// unarchive for projects), getProjects hides the row forever, so a task
	// still pointing at it dangles exactly as §5.3 describes. project_groups
	// have no deleted_at column; their only deletion is the purge.
	const fixes: Array<{ table: string; column: string; refLive: string }> = [
		{
			table: "tasks",
			column: "project_id",
			refLive:
				"SELECT id FROM projects WHERE purged_at IS NULL AND deleted_at IS NULL",
		},
		{
			table: "tags",
			column: "project_id",
			refLive:
				"SELECT id FROM projects WHERE purged_at IS NULL AND deleted_at IS NULL",
		},
		{
			table: "projects",
			column: "group_id",
			refLive: "SELECT id FROM project_groups WHERE purged_at IS NULL",
		},
	];
	for (const { table, column, refLive } of fixes) {
		const orphans = await tx.select<{
			id: string;
			field_updated_at: string | null;
		}>(
			`SELECT id, field_updated_at FROM ${table}
			 WHERE purged_at IS NULL AND ${column} IS NOT NULL
			   AND ${column} NOT IN (${refLive})`,
		);
		for (const orphan of orphans) {
			await tx.execute(
				`UPDATE ${table} SET ${column} = NULL, updated_at = ?, field_updated_at = ? WHERE id = ?`,
				[
					now,
					stampFields(orphan.field_updated_at, [column], now, deviceId),
					orphan.id,
				],
			);
		}
	}
}

/** End-of-cycle: tags that arrived after the tasks referencing them. */
export async function relinkPendingTags(tx: DbDriver): Promise<void> {
	const pending = await tx.select<{
		id: string;
		sync_extra: string;
		dirtied: string | null;
	}>(
		`SELECT t.id, t.sync_extra,
		        (SELECT dirtied_at FROM sync_outbox o WHERE o.entity_type = 'task' AND o.entity_id = t.id) AS dirtied
		 FROM tasks t WHERE t.sync_extra LIKE '%${UNLINKED_TAGS_KEY}%'`,
	);
	if (pending.length === 0) return;
	const live = await liveTagIds(tx);
	for (const row of pending) {
		let extra: Record<string, unknown>;
		try {
			extra = JSON.parse(row.sync_extra) as Record<string, unknown>;
		} catch {
			continue;
		}
		const unlinked = Array.isArray(extra[UNLINKED_TAGS_KEY])
			? (extra[UNLINKED_TAGS_KEY] as string[])
			: [];
		const linkable = unlinked.filter((t) => live.has(t));
		if (linkable.length === 0) continue;
		for (const tagId of linkable) {
			await tx.execute(
				"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
				[row.id, tagId],
			);
		}
		const still = unlinked.filter((t) => !live.has(t));
		if (still.length > 0) extra[UNLINKED_TAGS_KEY] = still;
		else delete extra[UNLINKED_TAGS_KEY];
		const nextExtra =
			Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
		await tx.execute("UPDATE tasks SET sync_extra = ? WHERE id = ?", [
			nextExtra,
			row.id,
		]);
		// Linking is pure materialisation: the tags field VALUE is unchanged
		// (linked ∪ unlinked is the same set), so nothing new must push. Drop
		// the outbox entry the UPDATE trigger just created — unless the task
		// was already dirty before this repair.
		if (row.dirtied === null) await clearOutbox(tx, "task", row.id);
	}
}
