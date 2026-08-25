import Database from "better-sqlite3";
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

	constructor(filename?: string);
	/**
	 * Adopt an already-open connection. Used by `reopen`: a second
	 * `new Database(":memory:")` would be a distinct, empty database.
	 */
	constructor(connection: Database.Database);
	constructor(source: string | Database.Database = ":memory:") {
		// One initialization path for every field, so a field added later cannot
		// be skipped the way a hand-copied list would skip it.
		this.db = typeof source === "string" ? new Database(source) : source;
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

	execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
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

	select<T>(query: string, bindValues: unknown[] = []): Promise<T[]> {
		const rows = this.db.prepare(query).all(...(bindValues as never[]));
		return Promise.resolve(rows as T[]);
	}

	async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
		// better-sqlite3's own `transaction()` helper only wraps synchronous
		// functions; `work` is async, so drive the statements by hand.
		this.raw("BEGIN");
		try {
			const out = await work(this);
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
	}

	/** A second driver over the same database, with no memoised state. */
	reopen(): BetterSqliteDriver {
		return new BetterSqliteDriver(this.db);
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
