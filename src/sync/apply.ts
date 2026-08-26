import type { DbDriver } from "@/db/driver";
import { type FieldStamps, stampFields } from "@/db/field-timestamps";
import { nowIso } from "@/lib/sync-clock";
import { stampsEqual } from "./merge";
import { PENDING_REF_KEY, payloadToWrite, UNLINKED_TAGS_KEY } from "./payload";
import {
	ENTITY_TABLE,
	type PendingRefs,
	type PulledRecord,
	type SyncEntityType,
	type SyncPayload,
} from "./types";

// The three nullable FK references sync has to keep consistent (task_tags is
// covered separately by _unlinkedTags). Shared by the pull-time deferral
// (upsertMerged), the end-of-cycle relink and the orphan repair.
const FK_REFS: ReadonlyArray<{
	entityType: SyncEntityType;
	table: string;
	column: string;
	refTable: string;
}> = [
	{
		entityType: "task",
		table: "tasks",
		column: "project_id",
		refTable: "projects",
	},
	{
		entityType: "tag",
		table: "tags",
		column: "project_id",
		refTable: "projects",
	},
	{
		entityType: "project",
		table: "projects",
		column: "group_id",
		refTable: "project_groups",
	},
];

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
	const fk = FK_REFS.find((f) => f.entityType === entityType);
	if (fk && write.columns[fk.column] != null) {
		const refId = String(write.columns[fk.column]);
		const parent = await tx.select<{ id: string }>(
			`SELECT id FROM ${fk.refTable} WHERE id = ?`,
			[refId],
		);
		if (parent.length === 0) {
			// The parent has not arrived yet — it can sit in a LATER pull page
			// (or in quarantine); a tombstone would satisfy the FK, absence does
			// not. Defer: provisional NULL WITHOUT restamping (this is not an
			// edit and must never propagate), true value parked in sync_extra
			// (folded back on push), materialised by relinkPendingRefs at end of
			// cycle. repairOrphans only ever sees the reference again once the
			// parent row exists, so "not yet arrived" never repairs as "purged".
			write.columns[fk.column] = null;
			const extra = write.extra
				? (JSON.parse(write.extra) as Record<string, unknown>)
				: {};
			extra[PENDING_REF_KEY] = {
				[fk.column]: { id: refId, f: payload._fields[fk.column] ?? null },
			} satisfies PendingRefs;
			write.extra = JSON.stringify(extra);
		}
	}
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
 * Purges a LIVE local tag row (`loserId`) that lost a name collision, renaming
 * it to its own id (frees the name, matches the tombstone convention) and
 * remapping its task_tags links to `winnerId`. `winnerId`'s row must already
 * exist (or be about to, via the INSERT OR IGNORE stub below) since
 * task_tags.tag_id is a foreign key. Shared by both collision directions:
 * "remote/merged wins" (winner is the incoming record) and "rename-into-
 * existing-name" (winner is the pre-existing local rival).
 */
async function purgeLoserAndRemap(
	tx: DbDriver,
	loserId: string,
	loserFieldUpdatedAt: string | null,
	winnerId: string,
	winnerName: string,
	deviceId: string,
): Promise<void> {
	const now = nowIso();
	await tx.execute(
		"UPDATE tags SET purged_at = ?, updated_at = ?, name = ?, field_updated_at = ? WHERE id = ?",
		[
			now,
			now,
			loserId,
			stampFields(loserFieldUpdatedAt, ["purged_at", "name"], now, deviceId),
			loserId,
		],
	);
	await touchOutbox(tx, "tag", loserId);
	// The winner's row may not exist yet (upsertMerged, when it runs, comes
	// after this resolution) and task_tags.tag_id is a foreign key: give the
	// remap below a row to point at. The loser's rename just freed the name,
	// and OR IGNORE no-ops when the winner already exists under another name.
	// upsertMerged (live-record path) then overwrites this stub with the real
	// payload; the rename-into-existing-name path leaves the pre-existing
	// winner row untouched.
	await tx.execute(
		"INSERT OR IGNORE INTO tags (id, name, created_at, updated_at, field_updated_at) VALUES (?, ?, ?, ?, '{}')",
		[winnerId, winnerName, now, now],
	);
	const linked = await tx.select<{ task_id: string }>(
		"SELECT task_id FROM task_tags WHERE tag_id = ?",
		[loserId],
	);
	for (const { task_id } of linked) {
		await tx.execute(
			"INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
			[task_id, winnerId],
		);
		await tx.execute("DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?", [
			task_id,
			loserId,
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
}

/**
 * tags.name is globally UNIQUE (migration 001): two devices creating the same
 * name offline collide at apply time. Deterministic rule — the SMALLER id
 * wins — so every device resolves the same collision the same way without
 * coordination.
 *
 * Runs on the MERGED name, not the incoming record's raw payload name: the
 * pre-merge remote name can be stale (a device that only edited color pushes
 * whatever name it last saw), and resolving against it can purge a tag that
 * is live and correctly named on every other device (rename-and-reuse
 * scenario — see engine.pull.test.ts). Both devices compute the same merged
 * payload, so resolving on it stays deterministic without coordination.
 *
 * Outbox ordering (dirtied_at) guarantees a live tag always arrives before
 * the tombstone of its duplicate, so task assignments survive the remap.
 */
export async function resolveTagNameCollision(
	tx: DbDriver,
	recordId: string,
	mergedName: string,
	deviceId: string,
	hasLocalRow: boolean,
): Promise<"apply-live" | "keep-local" | "purge-local-row"> {
	// A purged tag squatting the name would break the upsert's UNIQUE: free it.
	const squatters = await tx.select<{ id: string }>(
		"SELECT id FROM tags WHERE name = ? AND id != ? AND purged_at IS NOT NULL",
		[mergedName, recordId],
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
		[mergedName, recordId],
	);
	const rival = rivals[0];
	if (!rival) return "apply-live";

	if (rival.id < recordId) {
		// Rival (pre-existing, smaller id) wins.
		if (!hasLocalRow) {
			// Pure duplicate-create: no local row for the incoming id, so there
			// is nothing to remap — just refuse the incoming record.
			return "keep-local";
		}
		// Rename-into-existing-name: a local row for recordId exists (e.g. it
		// was renamed to collide with a rival that already had the name).
		// Purge that local row and remap its links onto the rival; the merged
		// live state must NOT be upserted over it.
		const localRow = await tx.select<{ field_updated_at: string | null }>(
			"SELECT field_updated_at FROM tags WHERE id = ?",
			[recordId],
		);
		await purgeLoserAndRemap(
			tx,
			recordId,
			localRow[0]?.field_updated_at ?? null,
			rival.id,
			mergedName,
			deviceId,
		);
		return "purge-local-row";
	}

	// Incoming/merged record wins: purge the local rival and remap its links.
	await purgeLoserAndRemap(
		tx,
		rival.id,
		rival.field_updated_at,
		recordId,
		mergedName,
		deviceId,
	);
	return "apply-live";
}

/** End-of-cycle §5.3: reattach dangling references — a real, propagating edit. */
export async function repairOrphans(
	tx: DbDriver,
	deviceId: string,
): Promise<void> {
	const now = nowIso();
	// A referent is gone only once PURGED. An archived referent (deleted_at,
	// §1.3) is an ordinary, restorable LWW state: detaching its tasks here
	// would propagate a stamped edit that destroys the archive semantics.
	for (const { table, column, refTable } of FK_REFS) {
		const orphans = await tx.select<{
			id: string;
			field_updated_at: string | null;
		}>(
			`SELECT id, field_updated_at FROM ${table}
			 WHERE purged_at IS NULL AND ${column} IS NOT NULL
			   AND ${column} NOT IN (SELECT id FROM ${refTable} WHERE purged_at IS NULL)`,
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

/**
 * End-of-cycle: FK references deferred by upsertMerged because their parent
 * had not arrived yet. Runs BEFORE repairOrphans so a parent that turned out
 * to be a tombstone is materialised first, then detached WITH a stamp by the
 * orphan repair — the genuine "parent purged" answer. A parent still absent
 * (later cycle, quarantine) stays parked; a field re-stamped by a newer local
 * edit has won LWW over the parked value, which is dropped.
 */
export async function relinkPendingRefs(tx: DbDriver): Promise<void> {
	for (const { entityType, table, column, refTable } of FK_REFS) {
		const pending = await tx.select<{
			id: string;
			sync_extra: string;
			field_updated_at: string | null;
			dirtied: string | null;
		}>(
			`SELECT t.id, t.sync_extra, t.field_updated_at,
			        (SELECT dirtied_at FROM sync_outbox o WHERE o.entity_type = '${entityType}' AND o.entity_id = t.id) AS dirtied
			 FROM ${table} t WHERE t.sync_extra LIKE '%${PENDING_REF_KEY}%'`,
		);
		for (const row of pending) {
			let extra: Record<string, unknown>;
			try {
				extra = JSON.parse(row.sync_extra) as Record<string, unknown>;
			} catch {
				continue;
			}
			const refs = extra[PENDING_REF_KEY] as PendingRefs | undefined;
			const ref = refs?.[column];
			if (!refs || !ref) continue;
			let stamps: FieldStamps;
			try {
				stamps = JSON.parse(row.field_updated_at ?? "{}") as FieldStamps;
			} catch {
				stamps = {};
			}
			const superseded = !stampsEqual(stamps[column], ref.f);
			if (!superseded) {
				const parent = await tx.select<{ id: string }>(
					`SELECT id FROM ${refTable} WHERE id = ?`,
					[ref.id],
				);
				if (parent.length === 0) continue; // still absent: stays parked
			}
			delete refs[column];
			if (Object.keys(refs).length === 0) delete extra[PENDING_REF_KEY];
			const nextExtra =
				Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
			if (superseded) {
				await tx.execute(`UPDATE ${table} SET sync_extra = ? WHERE id = ?`, [
					nextExtra,
					row.id,
				]);
			} else {
				await tx.execute(
					`UPDATE ${table} SET ${column} = ?, sync_extra = ? WHERE id = ?`,
					[ref.id, nextExtra, row.id],
				);
			}
			// Materialisation (or dropping a lost value) changes nothing the
			// field's stamp does not already claim: nothing new must push. Drop
			// the outbox entry the UPDATE trigger just created — unless the row
			// was already dirty before this repair.
			if (row.dirtied === null) await clearOutbox(tx, entityType, row.id);
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
