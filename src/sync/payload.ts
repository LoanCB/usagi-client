import type { DbDriver } from "@/db/driver";
import type { FieldStamps } from "@/db/field-timestamps";
import { stampsEqual } from "./merge";
import {
	ENTITY_TABLE,
	type PendingRefs,
	type SyncEntityType,
	type SyncPayload,
} from "./types";

/**
 * The synced fields per entity, spec §2.2. Same lists as 4a's
 * IMPORT_STAMPED_FIELDS minus purged_at (a purge travels as a tombstone, never
 * as a payload field) plus tags, embedded in the task payload per §1.5 because
 * task_tags has no timestamps of its own.
 */
export const SYNC_FIELDS = {
	task: [
		"title",
		"description",
		"project_id",
		"priority",
		"due_date",
		"tags",
		"sort_key",
		"completed_at",
		"deleted_at",
	],
	project: ["name", "color", "icon", "group_id", "sort_key", "deleted_at"],
	tag: ["name", "color", "project_id", "deleted_at"],
	project_group: ["name", "color", "sort_key"],
} as const satisfies Record<SyncEntityType, readonly string[]>;

/**
 * A tag id the task payload references but no local live tag carries — either
 * quarantined or simply later in the same pull cycle. Parked in sync_extra
 * under this reserved key so the id is never lost, folded back into the tags
 * field on push, re-linked at the end of every pull cycle. Keys starting with
 * "_" never leave sync_extra as payload fields.
 */
export const UNLINKED_TAGS_KEY = "_unlinkedTags";

/**
 * An FK reference (task/tag → project, project → group) whose parent row does
 * not exist locally yet — it can land in a LATER pull page than its child when
 * re-touched after it (higher seq). The column holds a provisional NULL that
 * is deliberately NOT stamped (it is not an edit and must never propagate);
 * the true value is parked here, folded back into the payload on push, and
 * materialised by relinkPendingRefs once the parent row exists.
 */
export const PENDING_REF_KEY = "_pendingRef";

const META_KEYS = new Set(["_v", "_fields", "created_at"]);

const SYNC_FIELD_SET: Record<SyncEntityType, ReadonlySet<string>> = {
	task: new Set<string>(SYNC_FIELDS.task),
	project: new Set<string>(SYNC_FIELDS.project),
	tag: new Set<string>(SYNC_FIELDS.tag),
	project_group: new Set<string>(SYNC_FIELDS.project_group),
};

export interface EntitySnapshot {
	columns: Record<string, unknown>;
	tagIds: string[];
}

export interface EntityWrite {
	columns: Record<string, unknown>;
	tagIds: string[];
	stamps: string;
	extra: string | null;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
	if (typeof raw !== "string" || raw === "") return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export async function loadSnapshot(
	db: DbDriver,
	entityType: SyncEntityType,
	id: string,
): Promise<EntitySnapshot | null> {
	const table = ENTITY_TABLE[entityType];
	const rows = await db.select<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE id = ?`,
		[id],
	);
	if (!rows[0]) return null;
	let tagIds: string[] = [];
	if (entityType === "task") {
		const links = await db.select<{ tag_id: string }>(
			"SELECT tag_id FROM task_tags WHERE task_id = ? ORDER BY tag_id",
			[id],
		);
		tagIds = links.map((l) => l.tag_id);
	}
	return { columns: rows[0], tagIds };
}

export function snapshotToPayload(
	entityType: SyncEntityType,
	snapshot: EntitySnapshot,
): SyncPayload {
	const stamps = parseJsonObject(
		snapshot.columns.field_updated_at,
	) as FieldStamps;
	const extra = parseJsonObject(snapshot.columns.sync_extra);
	const payload: SyncPayload = {
		_v: 1,
		created_at: String(snapshot.columns.created_at),
		_fields: stamps,
	};
	for (const field of SYNC_FIELDS[entityType]) {
		if (field === "tags") {
			const unlinked = Array.isArray(extra[UNLINKED_TAGS_KEY])
				? (extra[UNLINKED_TAGS_KEY] as string[])
				: [];
			payload.tags = [...new Set([...snapshot.tagIds, ...unlinked])].sort();
		} else {
			payload[field] = snapshot.columns[field] ?? null;
		}
	}
	for (const [key, value] of Object.entries(extra)) {
		if (!key.startsWith("_")) payload[key] = value;
	}
	const pending = extra[PENDING_REF_KEY];
	if (pending && typeof pending === "object") {
		for (const [column, ref] of Object.entries(pending as PendingRefs)) {
			// Fold the parked reference back over the provisional NULL, but only
			// while the field still carries the stamp recorded at deferral time:
			// a newer local edit owns the field and must not be overridden.
			if (
				SYNC_FIELD_SET[entityType].has(column) &&
				stampsEqual(stamps[column], ref.f)
			) {
				payload[column] = ref.id;
			}
		}
	}
	return payload;
}

export function payloadToWrite(
	entityType: SyncEntityType,
	payload: SyncPayload,
	linkableTagIds: ReadonlySet<string>,
): EntityWrite {
	const known = SYNC_FIELD_SET[entityType];
	const columns: Record<string, unknown> = { created_at: payload.created_at };
	for (const field of SYNC_FIELDS[entityType]) {
		if (field !== "tags") columns[field] = payload[field] ?? null;
	}
	const extra: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(payload)) {
		if (!known.has(key) && !META_KEYS.has(key) && !key.startsWith("_")) {
			extra[key] = value;
		}
	}
	let tagIds: string[] = [];
	if (entityType === "task") {
		const wanted = Array.isArray(payload.tags)
			? (payload.tags as string[])
			: [];
		tagIds = wanted.filter((t) => linkableTagIds.has(t));
		const unlinked = wanted.filter((t) => !linkableTagIds.has(t));
		if (unlinked.length > 0) extra[UNLINKED_TAGS_KEY] = unlinked;
	}
	return {
		columns,
		tagIds,
		stamps: JSON.stringify(payload._fields),
		extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
	};
}

export function serializePayload(payload: SyncPayload): string {
	return JSON.stringify(payload);
}

export function plaintextByteLength(plaintext: string): number {
	return new TextEncoder().encode(plaintext).length;
}
