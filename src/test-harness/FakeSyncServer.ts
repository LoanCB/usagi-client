import {
	CursorOutOfRangeError,
	PUSH_MAX_CHANGES,
	type PullResponse,
	type PushChange,
	type PushResponse,
	type SyncEntityType,
	type SyncTransport,
} from "@/sync/types";

export interface StoredRecord {
	entityType: SyncEntityType;
	id: string;
	seq: number;
	ciphertext: string | null;
	nonce: string | null;
	purged: boolean;
}

/**
 * In-memory stand-in for usagi-server's /v1/sync routes, mirroring the
 * VERIFIED semantics (develop 74e5f2c), not the docs: dense per-write seqs,
 * unconditional overwrite, exclusive cursor, hasMore, 409 past the counter,
 * and the records_tombstone_shape CHECK as a loud throw. Its own test file
 * replays the behaviours the server e2e suite pins — that is what lets the
 * engine tests trust this fake.
 */
export class FakeSyncServer {
	private records = new Map<string, StoredRecord>();
	private counter = 0;
	requestCount = 0;

	get seqCounter(): number {
		return this.counter;
	}

	push(changes: PushChange[]): PushResponse {
		if (changes.length < 1 || changes.length > PUSH_MAX_CHANGES) {
			throw new Error(`invalid batch size ${changes.length}`);
		}
		for (const change of changes) {
			if (change.purged && (change.ciphertext ?? null) !== null) {
				throw new Error("tombstone carries a ciphertext");
			}
			if (change.purged && (change.nonce ?? null) !== null) {
				throw new Error("tombstone carries a nonce");
			}
			if (!change.purged && (!change.ciphertext || !change.nonce)) {
				throw new Error("live change is missing its payload");
			}
		}
		const applied = changes.map((change) => {
			this.counter += 1;
			this.records.set(`${change.entityType} ${change.id}`, {
				entityType: change.entityType,
				id: change.id,
				seq: this.counter,
				ciphertext: change.purged ? null : (change.ciphertext as string),
				nonce: change.purged ? null : (change.nonce as string),
				purged: change.purged,
			});
			return {
				entityType: change.entityType,
				id: change.id,
				seq: this.counter,
			};
		});
		return { applied, serverTime: new Date().toISOString() };
	}

	pull(cursor: number, limit: number): PullResponse {
		if (cursor > this.counter) {
			throw new CursorOutOfRangeError("cursor is beyond the workspace counter");
		}
		const sorted = [...this.records.values()]
			.filter((r) => r.seq > cursor)
			.sort((a, b) => a.seq - b.seq);
		const page = sorted.slice(0, limit);
		return {
			records: page.map((r) => ({ ...r })),
			nextCursor: page.length > 0 ? page[page.length - 1].seq : cursor,
			hasMore: sorted.length > limit,
			serverTime: new Date().toISOString(),
		};
	}

	transport(): SyncTransport {
		return {
			push: async (changes) => {
				this.requestCount += 1;
				return this.push(changes.map((c) => ({ ...c })));
			},
			pull: async (cursor, limit) => {
				this.requestCount += 1;
				return this.pull(cursor, limit);
			},
		};
	}

	dump(): StoredRecord[] {
		return [...this.records.values()].sort((a, b) => a.seq - b.seq);
	}
}
