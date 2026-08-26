import type Database from "@tauri-apps/plugin-sql";
import { ConnectionLock } from "./connection-lock";
import type { DbDriver, QueryResult } from "./driver";
import type { TodoRepository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";

export type { TodoRepository } from "./repository";

/**
 * One lock per Database, not per adapter: App.tsx builds an adapter for the
 * sync engine and another inside `createRepository`, and it is precisely those
 * two that must not overlap.
 */
const locks = new WeakMap<Database, ConnectionLock>();

function lockFor(db: Database): ConnectionLock {
	const existing = locks.get(db);
	if (existing) return existing;
	const lock = new ConnectionLock();
	locks.set(db, lock);
	return lock;
}

/** Statements straight to the plugin, with no locking of their own. */
function unlockedDriver(db: Database): Omit<DbDriver, "transaction"> {
	return {
		async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
			const result = await db.execute(query, bindValues);
			return {
				rowsAffected: result.rowsAffected,
				lastInsertId: result.lastInsertId ?? 0,
			};
		},
		select<T>(query: string, bindValues?: unknown[]): Promise<T[]> {
			return db.select<T[]>(query, bindValues);
		},
	};
}

export function adaptDatabase(db: Database): DbDriver {
	const lock = lockFor(db);
	const raw = unlockedDriver(db);

	// Handed to `work`: the lock is already held, so re-acquiring would
	// deadlock. Nesting stays unsupported — SQLite rejects the inner BEGIN —
	// but it must say so rather than hang on the lock.
	const tx: DbDriver = {
		...raw,
		transaction() {
			return Promise.reject(new Error("nested transactions are not supported"));
		},
	};

	return {
		async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
			const release = await lock.acquire("shared");
			try {
				return await raw.execute(query, bindValues);
			} finally {
				release();
			}
		},
		async select<T>(query: string, bindValues?: unknown[]): Promise<T[]> {
			const release = await lock.acquire("shared");
			try {
				return await raw.select<T>(query, bindValues);
			} finally {
				release();
			}
		},
		async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
			// tauri-plugin-sql has no transaction API of its own; the statements go
			// through execute like any other. The exclusive lock is what keeps the
			// whole BEGIN..COMMIT alone on the connection (§9.5).
			const release = await lock.acquire("exclusive");
			try {
				await raw.execute("BEGIN", []);
				try {
					const out = await work(tx);
					await raw.execute("COMMIT", []);
					return out;
				} catch (error) {
					try {
						await raw.execute("ROLLBACK", []);
					} catch {
						// A failing ROLLBACK must not replace the error being handled: the
						// original is the one explaining why the transaction aborted.
						// `Error.cause` would carry both, but it needs an ES2022 lib and
						// this project targets ES2020.
					}
					throw error;
				}
			} finally {
				release();
			}
		},
	};
}

export function createRepository(db: Database): TodoRepository {
	return new SqliteRepository(adaptDatabase(db));
}
