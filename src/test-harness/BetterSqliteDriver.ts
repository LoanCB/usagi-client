import Database from "better-sqlite3";
import { ConnectionLock } from "@/db/connection-lock";
import type { DbDriver, QueryResult } from "@/db/driver";

/**
 * Real SQLite behind the DbDriver interface, for tests that must exercise
 * actual SQL: migrations, triggers, CHECK constraints. The production driver
 * wraps tauri-plugin-sql, which cannot run outside a Tauri process.
 */
export class BetterSqliteDriver implements DbDriver {
	private db: Database.Database;
	private writes = 0;
	private failNext: RegExp | null = null;
	/**
	 * Shared with every driver over the same connection, exactly as production
	 * shares one lock per Database: a test passing on an interleaving the real
	 * adapter serializes would be a test that lies.
	 */
	private lock: ConnectionLock;
	/**
	 * The view `transaction` hands to its callback, built once per driver exactly
	 * as production builds it once per adapter (`adaptDatabase`). It has to be
	 * stable: callers key per-connection caches on the driver object they are
	 * given — `getOrCreateDeviceId` keys a WeakMap on it — so a fresh view per
	 * transaction would miss that cache every time and exercise a path
	 * production never takes. `reopen` returns a new driver, and therefore a new
	 * view, which is the restart it is meant to model.
	 */
	private readonly tx: DbDriver;

	constructor(filename?: string);
	/**
	 * Adopt an already-open connection. Used by `reopen`: a second
	 * `new Database(":memory:")` would be a distinct, empty database.
	 */
	constructor(connection: Database.Database, lock?: ConnectionLock);
	constructor(
		source: string | Database.Database = ":memory:",
		lock?: ConnectionLock,
	) {
		// One initialization path for every field, so a field added later cannot
		// be skipped the way a hand-copied list would skip it.
		this.db = typeof source === "string" ? new Database(source) : source;
		this.lock = lock ?? new ConnectionLock();
		// `transaction` holds the lock, so this view must not re-acquire it.
		this.tx = {
			execute: (query, bindValues = []) =>
				this.executeUnlocked(query, bindValues),
			select: (query, bindValues = []) =>
				this.selectUnlocked(query, bindValues),
			transaction: () =>
				Promise.reject(new Error("nested transactions are not supported")),
		};
		// Match tauri-plugin-sql, which enables FK enforcement per connection.
		this.db.pragma("foreign_keys = ON");
	}

	/**
	 * Run a statement outside the instrumentation. Transaction control is
	 * bookkeeping, not a write under test: counting it would inflate
	 * `countWrites`, and a broad `failNextExecuteMatching` pattern must not be
	 * able to intercept the COMMIT.
	 */
	private raw(query: string): void {
		this.db.prepare(query).run();
	}

	/** The statement itself, with the instrumentation but without the lock. */
	private executeUnlocked(
		query: string,
		bindValues: unknown[],
	): Promise<QueryResult> {
		if (this.failNext?.test(query)) {
			this.failNext = null;
			return Promise.reject(
				new Error(`BetterSqliteDriver: forced failure for "${query}"`),
			);
		}
		this.writes++;
		try {
			const info = this.db.prepare(query).run(...(bindValues as never[]));
			return Promise.resolve({
				rowsAffected: info.changes,
				lastInsertId: Number(info.lastInsertRowid),
			});
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private selectUnlocked<T>(
		query: string,
		bindValues: unknown[],
	): Promise<T[]> {
		const rows = this.db.prepare(query).all(...(bindValues as never[]));
		return Promise.resolve(rows as T[]);
	}

	async execute(
		query: string,
		bindValues: unknown[] = [],
	): Promise<QueryResult> {
		const release = await this.lock.acquire("shared");
		try {
			return await this.executeUnlocked(query, bindValues);
		} finally {
			release();
		}
	}

	async select<T>(query: string, bindValues: unknown[] = []): Promise<T[]> {
		const release = await this.lock.acquire("shared");
		try {
			return await this.selectUnlocked<T>(query, bindValues);
		} finally {
			release();
		}
	}

	async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
		const release = await this.lock.acquire("exclusive");
		try {
			// better-sqlite3's own `transaction()` helper only wraps synchronous
			// functions; `work` is async, so drive the statements by hand.
			this.raw("BEGIN");
			try {
				const out = await work(this.tx);
				this.raw("COMMIT");
				return out;
			} catch (error) {
				try {
					this.raw("ROLLBACK");
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
	}

	/** A second driver over the same database, with no memoised state. */
	reopen(): BetterSqliteDriver {
		return new BetterSqliteDriver(this.db, this.lock);
	}

	/** Statements executed so far. Task 7 asserts a move writes one row, not N. */
	countWrites(): number {
		return this.writes;
	}

	/**
	 * Make the next execute matching `pattern` throw.
	 *
	 * Atomicity is otherwise only assertable by claim: Tasks 8 and 9 need a
	 * failure *between* two writes to prove the rollback actually happens.
	 */
	failNextExecuteMatching(pattern: RegExp): void {
		this.failNext = pattern;
	}

	close(): void {
		this.db.close();
	}
}
