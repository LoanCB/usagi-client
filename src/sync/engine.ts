import { getOrCreateDeviceId } from "@/db/device-id";
import type { DbDriver } from "@/db/driver";
import { nowIso, nowMs, setClockOffsetMs } from "@/lib/sync-clock";
import {
	applyRemoteTombstone,
	clearOutbox,
	quarantinePull,
	quarantinePushTooLarge,
	relinkPendingRefs,
	relinkPendingTags,
	repairOrphans,
	resolveTagNameCollision,
	touchOutbox,
	upsertMerged,
	writeLocalTombstone,
} from "./apply";
import { SyncHttpError, SyncNetworkError } from "./http";
import { mergePayloads } from "./merge";
import {
	loadSnapshot,
	plaintextByteLength,
	serializePayload,
	snapshotToPayload,
} from "./payload";
import { getSyncState, setSyncState } from "./state";
import {
	CLIENT_PROTOCOL_VERSION,
	CursorOutOfRangeError,
	MAX_PLAINTEXT_BYTES,
	PUSH_MAX_CHANGES,
	type PulledRecord,
	type PullResponse,
	type PushChange,
	ReauthRequiredError,
	type RecordCipher,
	type ServerInfo,
	SYNC_PULL_LIMIT,
	type SyncEntityType,
	type SyncPayload,
	type SyncStatus,
	type SyncTransport,
} from "./types";

export interface SyncEngineDeps {
	db: DbDriver;
	transport: SyncTransport;
	cipher: RecordCipher;
	getServerInfo: () => Promise<ServerInfo>;
}

interface DecryptedRecord {
	record: PulledRecord;
	payload: SyncPayload | null;
	failure: string | null;
}

interface OutboxEntry {
	entity_type: string;
	entity_id: string;
	dirtied_at: string;
}

// A continuously-edited row re-dirties itself during its own push and comes
// back next round; the bound only stops that pathological loop from starving
// the caller — leftovers are picked up by the §4.2 debounce trigger.
const MAX_PUSH_ROUNDS = 50;

// FK dependency order for applying one pull page: project_group has no FK,
// project references project_group, tag references project, task references
// both project and tag (the latter tolerated out of order via _unlinkedTags).
const APPLY_ORDER_RANK: Record<SyncEntityType, number> = {
	project_group: 0,
	project: 1,
	tag: 2,
	task: 3,
};

export class SyncEngine {
	private status: SyncStatus = "idle";
	private readonly listeners = new Set<(status: SyncStatus) => void>();
	private running = false;
	private rerunRequested = false;
	private protocolChecked = false;

	constructor(private readonly deps: SyncEngineDeps) {}

	getStatus(): SyncStatus {
		return this.status;
	}

	onStatus(listener: (status: SyncStatus) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private setStatus(status: SyncStatus): void {
		if (this.status === status) return;
		this.status = status;
		for (const listener of this.listeners) listener(status);
	}

	/** Pull → merge → push (§4.1), single-flight with rerun coalescing. */
	async syncNow(): Promise<void> {
		if (this.running) {
			this.rerunRequested = true;
			return;
		}
		this.running = true;
		try {
			if (!(await this.ensureProtocol())) return;
			await this.loadPersistedOffset();
			this.setStatus("syncing");
			await this.retryQuarantine();
			const gated = await this.pullPhase();
			if (gated) {
				this.setStatus("awaiting-first-sync");
				return;
			}
			await this.repairPhase();
			await this.pushPhase();
			await setSyncState(this.deps.db, "last_sync_at", nowIso());
			this.setStatus("idle");
		} catch (err) {
			if (err instanceof ReauthRequiredError) {
				this.setStatus("reauth-required");
				return;
			}
			this.setStatus("idle");
			// §7: offline and transient server failures are normal states — the
			// outbox accumulates and the next trigger retries. Anything else
			// (a DB failure, a bug) must surface, not vanish.
			// SyncNetworkError is the production offline path (Tauri's fetch
			// rejects with a serialized Rust error); TypeError is kept for
			// browser fetch in dev/tests.
			if (
				err instanceof SyncHttpError ||
				err instanceof SyncNetworkError ||
				err instanceof TypeError
			)
				return;
			throw err;
		} finally {
			this.running = false;
			if (this.rerunRequested) {
				this.rerunRequested = false;
				void this.syncNow();
			}
		}
	}

	/**
	 * §6.4 — the answer to the first-sync question, called by the 4d dialog.
	 * merge: flag and run a normal cycle, the per-field LWW reconciles.
	 * replace: wipe the five local tables PHYSICALLY (nothing was ever pushed,
	 * so there is nothing to tombstone), and empty the outbox LAST inside the
	 * same transaction — the deletes re-fill it through the triggers, and an
	 * outbox emptied first would push the abandoned data right back up: the
	 * exact silent union §6.4 exists to prevent. The automatic JSON backup
	 * before "replace" belongs to the 4d dialog, upstream of this call.
	 */
	async resolveFirstSync(choice: "merge" | "replace"): Promise<void> {
		const db = this.deps.db;
		if (choice === "replace") {
			await db.transaction(async (tx) => {
				await tx.execute("DELETE FROM task_tags");
				await tx.execute("DELETE FROM tasks");
				await tx.execute("DELETE FROM tags");
				await tx.execute("DELETE FROM projects");
				await tx.execute("DELETE FROM project_groups");
				await tx.execute("DELETE FROM sync_outbox");
				await setSyncState(tx, "first_sync_resolved", "1");
			});
		} else {
			await setSyncState(db, "first_sync_resolved", "1");
		}
		this.setStatus("idle");
		await this.syncNow();
	}

	async retryQuarantine(): Promise<void> {
		const db = this.deps.db;
		const rows = await db.select<{
			entity_type: SyncEntityType;
			entity_id: string;
			seq: number | null;
			ciphertext: string | null;
			nonce: string | null;
		}>(
			"SELECT entity_type, entity_id, seq, ciphertext, nonce FROM sync_quarantine WHERE direction = 'pull'",
		);
		if (rows.length === 0) return;
		const deviceId = await getOrCreateDeviceId(db);
		for (const row of rows) {
			if (row.ciphertext === null || row.nonce === null) continue;
			const record: PulledRecord = {
				entityType: row.entity_type,
				id: row.entity_id,
				seq: row.seq ?? 0,
				ciphertext: row.ciphertext,
				nonce: row.nonce,
				purged: false,
			};
			const item = await this.decryptOne(record);
			if (item.failure !== null) continue; // still poisoned: stays parked (§7)
			await db.transaction(async (tx) => {
				await this.applyOne(tx, item, nowMs(), deviceId);
				await tx.execute(
					"DELETE FROM sync_quarantine WHERE entity_type = ? AND entity_id = ?",
					[row.entity_type, row.entity_id],
				);
			});
		}
	}

	private async ensureProtocol(): Promise<boolean> {
		if (this.protocolChecked) return this.status !== "protocol-mismatch";
		const info = await this.deps.getServerInfo();
		this.protocolChecked = true;
		if (info.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
			// §4.0: refuse outright. The app stays fully usable locally.
			this.setStatus("protocol-mismatch");
			return false;
		}
		return true;
	}

	private async loadPersistedOffset(): Promise<void> {
		const stored = await getSyncState(this.deps.db, "clock_offset_ms");
		setClockOffsetMs(stored ? Number(stored) || 0 : 0);
	}

	private async absorbServerTime(serverTime: string): Promise<void> {
		const offset = Date.parse(serverTime) - Date.now();
		if (!Number.isFinite(offset)) return;
		setClockOffsetMs(offset);
		await setSyncState(this.deps.db, "clock_offset_ms", String(offset));
	}

	/** Returns true when the §6.4 first-sync question must be asked. */
	private async pullPhase(): Promise<boolean> {
		const db = this.deps.db;
		let cursor = Number((await getSyncState(db, "cursor")) ?? "0");
		let cursorWasReset = false;
		for (;;) {
			let page: PullResponse;
			try {
				page = await this.deps.transport.pull(cursor, SYNC_PULL_LIMIT);
			} catch (err) {
				if (err instanceof CursorOutOfRangeError && !cursorWasReset) {
					// Contract from 4b: this cursor cannot have come from this
					// workspace. Reset once and full-pull; merging is idempotent.
					cursorWasReset = true;
					cursor = 0;
					await setSyncState(db, "cursor", "0");
					continue;
				}
				throw err;
			}
			await this.absorbServerTime(page.serverTime);
			if (await this.firstSyncGate(cursor, page)) return true;
			const serverTimeMs = Date.parse(page.serverTime);
			// Decryption is pure per record (no DB access, no cross-record
			// dependency) and Promise.all preserves input order, so a page's
			// records decrypt concurrently across the Tauri IPC boundary.
			const decrypted: DecryptedRecord[] = await Promise.all(
				page.records.map((record) => this.decryptOne(record)),
			);
			const deviceId = await getOrCreateDeviceId(db);
			// Apply in FK-dependency order (project_group, project, tag, task), not
			// push-arrival order: the outbox re-dirties an entity's row on every
			// touch, so a parent touched again after its child was pushed can sort
			// AFTER that child in server seq. Same-type/id relative order (there is
			// at most one live record per id per page) is preserved by the sort's
			// stability. A parent landing in a LATER page cannot be ordered here at
			// all: upsertMerged defers that reference (sync_extra PENDING_REF_KEY)
			// and relinkPendingRefs materialises it at end of cycle.
			const ordered = [...decrypted].sort(
				(x, y) =>
					APPLY_ORDER_RANK[x.record.entityType] -
					APPLY_ORDER_RANK[y.record.entityType],
			);
			// §9.5: applied records, quarantine rows, outbox cleanup and the
			// cursor advance commit or roll back as one unit.
			await db.transaction(async (tx) => {
				for (const item of ordered) {
					// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: the applies are ordered SQL statements inside ONE transaction (§9.5) — each item may read state written by an earlier one (a tag inserted before a task links it), so running them concurrently would break both the FK-dependency order and the transaction's atomicity
					await this.applyOne(tx, item, serverTimeMs, deviceId);
				}
				await setSyncState(tx, "cursor", String(page.nextCursor));
			});
			cursor = page.nextCursor;
			if (!page.hasMore) return false;
		}
	}

	private async decryptOne(record: PulledRecord): Promise<DecryptedRecord> {
		if (record.purged || record.ciphertext === null || record.nonce === null) {
			return {
				record,
				payload: null,
				failure: record.purged ? null : "malformed-record",
			};
		}
		try {
			const plaintext = await this.deps.cipher.decrypt(
				record.entityType,
				record.id,
				record.ciphertext,
				record.nonce,
			);
			const parsed: unknown = JSON.parse(plaintext);
			if (
				!parsed ||
				typeof parsed !== "object" ||
				(parsed as SyncPayload)._v !== 1 ||
				typeof (parsed as SyncPayload)._fields !== "object"
			) {
				return { record, payload: null, failure: "malformed-payload" };
			}
			return { record, payload: parsed as SyncPayload, failure: null };
		} catch (err) {
			return {
				record,
				payload: null,
				failure:
					err instanceof SyntaxError ? "malformed-payload" : "decrypt-failed",
			};
		}
	}

	private async applyOne(
		tx: DbDriver,
		item: DecryptedRecord,
		serverTimeMs: number,
		deviceId: string,
	): Promise<void> {
		const { record } = item;
		if (record.purged) {
			await applyRemoteTombstone(tx, record.entityType, record.id);
			return;
		}
		if (item.failure !== null || item.payload === null) {
			await quarantinePull(tx, record, item.failure ?? "malformed-payload");
			return;
		}
		const snapshot = await loadSnapshot(tx, record.entityType, record.id);
		if (snapshot && snapshot.columns.purged_at != null) {
			// §5.2 the other way round: OUR purge outlives THEIR edit. Re-arm
			// the outbox so the tombstone pushes over the remote live version.
			await touchOutbox(tx, record.entityType, record.id);
			return;
		}
		const local = snapshot
			? snapshotToPayload(record.entityType, snapshot)
			: null;
		const merged = mergePayloads(local, item.payload, serverTimeMs);
		if (record.entityType === "tag") {
			// Resolve on the MERGED name, not item.payload's raw (possibly stale)
			// name: see resolveTagNameCollision's doc comment in apply.ts.
			const mergedName = String(merged.payload.name ?? "");
			const action = await resolveTagNameCollision(
				tx,
				record.id,
				mergedName,
				deviceId,
				snapshot !== null,
			);
			if (action === "keep-local") {
				await writeLocalTombstone(tx, "tag", record.id, deviceId);
				return;
			}
			if (action === "purge-local-row") {
				// The local row for record.id was purged and its links remapped
				// onto the surviving rival; the merged live state must not be
				// upserted over that tombstone.
				return;
			}
		}
		await upsertMerged(tx, record.entityType, record.id, merged.payload);
		// The upsert's UPDATE trigger just armed the outbox. If nothing local
		// survived the merge, the row is exactly what the server holds: clear
		// it in the SAME transaction (§9.5) or every pull becomes an echo push.
		if (!merged.locallyDirty) {
			await clearOutbox(tx, record.entityType, record.id);
		}
	}

	private async firstSyncGate(
		cursor: number,
		page: PullResponse,
	): Promise<boolean> {
		const db = this.deps.db;
		if (await getSyncState(db, "first_sync_resolved")) return false;
		if (cursor > 0) {
			// Mid-history cursor: this device already synced before the flag
			// existed; the question would be meaningless now.
			await setSyncState(db, "first_sync_resolved", "1");
			return false;
		}
		const counts = await db.select<{ n: number }>(
			`SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM projects)
			      + (SELECT COUNT(*) FROM tags) + (SELECT COUNT(*) FROM project_groups) AS n`,
		);
		const localNonEmpty = (counts[0]?.n ?? 0) > 0;
		if (!localNonEmpty || page.records.length === 0) {
			await setSyncState(db, "first_sync_resolved", "1");
			return false;
		}
		// §6.4: both sides have data. A naïve merge-push would read as silent
		// corruption — stop before applying anything and ask.
		return true;
	}

	private async repairPhase(): Promise<void> {
		const db = this.deps.db;
		const deviceId = await getOrCreateDeviceId(db);
		await db.transaction(async (tx) => {
			// Refs first: a parent that arrived as a tombstone is materialised,
			// then detached WITH a stamp by repairOrphans below.
			await relinkPendingRefs(tx);
			await relinkPendingTags(tx);
			await repairOrphans(tx, deviceId);
		});
	}

	private async pushPhase(): Promise<void> {
		const db = this.deps.db;
		for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
			const entries = await db.select<OutboxEntry>(
				"SELECT entity_type, entity_id, dirtied_at FROM sync_outbox ORDER BY dirtied_at, entity_type, entity_id LIMIT ?",
				[PUSH_MAX_CHANGES],
			);
			if (entries.length === 0) return;

			const changes: PushChange[] = [];
			const settled: OutboxEntry[] = [];
			for (const entry of entries) {
				const entityType = entry.entity_type as SyncEntityType;
				const snapshot = await loadSnapshot(db, entityType, entry.entity_id);
				if (!snapshot) {
					// Pre-4a ghost: the row was physically deleted; there is
					// nothing to push and nothing to tombstone.
					settled.push(entry);
					continue;
				}
				if (snapshot.columns.purged_at != null) {
					// Tombstone shape (note 4b): ciphertext/nonce omitted.
					changes.push({ entityType, id: entry.entity_id, purged: true });
					settled.push(entry);
					continue;
				}
				const plaintext = serializePayload(
					snapshotToPayload(entityType, snapshot),
				);
				if (plaintextByteLength(plaintext) > MAX_PLAINTEXT_BYTES) {
					// One oversized record must not wedge the outbox: the server
					// rejects the WHOLE batch on any invalid item.
					await db.transaction(async (tx) => {
						await quarantinePushTooLarge(tx, entityType, entry.entity_id);
						await tx.execute(
							"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND dirtied_at = ?",
							[entry.entity_type, entry.entity_id, entry.dirtied_at],
						);
					});
					continue;
				}
				const { ciphertext, nonce } = await this.deps.cipher.encrypt(
					entityType,
					entry.entity_id,
					plaintext,
				);
				changes.push({
					entityType,
					id: entry.entity_id,
					purged: false,
					ciphertext,
					nonce,
				});
				settled.push(entry);
			}

			let minAppliedSeq = 0;
			let maxAppliedSeq = 0;
			if (changes.length > 0) {
				const res = await this.deps.transport.push(changes);
				await this.absorbServerTime(res.serverTime);
				for (const applied of res.applied) {
					if (applied.seq > maxAppliedSeq) maxAppliedSeq = applied.seq;
					if (minAppliedSeq === 0 || applied.seq < minAppliedSeq) {
						minAppliedSeq = applied.seq;
					}
				}
			}
			await db.transaction(async (tx) => {
				for (const entry of settled) {
					// dirtied_at is part of the key on purpose: a local write
					// DURING the push replaced the entry with a fresher
					// dirtied_at, this delete misses it, and the row is pushed
					// again next round instead of being silently dropped.
					await tx.execute(
						"DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ? AND dirtied_at = ?",
						[entry.entity_type, entry.entity_id, entry.dirtied_at],
					);
				}
				if (maxAppliedSeq > 0) {
					// The server just assigned these seqs to OUR OWN writes: a
					// pull would return them right back for a no-op merge. Fast
					// forward the cursor past them — but ONLY when our batch is
					// contiguous with the cursor. If another device pushed
					// between our pull and our push, its seqs sit in the gap
					// between the cursor and our first applied seq; skipping
					// over them would silently lose those records until they
					// happen to change again (§3.2). Non-contiguous: leave the
					// cursor alone and let the next pull fetch the foreign
					// records plus our own echoes (idempotent no-op merges).
					const cursor = Number((await getSyncState(tx, "cursor")) ?? "0");
					if (minAppliedSeq === cursor + 1) {
						await setSyncState(tx, "cursor", String(maxAppliedSeq));
					}
				}
			});
		}
	}
}
