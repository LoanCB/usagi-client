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

	constructor(filename = ":memory:") {
		this.db = new Database(filename);
		// Match tauri-plugin-sql, which enables FK enforcement per connection.
		this.db.pragma("foreign_keys = ON");
	}

	/**
	 * Wrap an already-open connection instead of opening a new one. Needed by
	 * `reopen`: a second `new Database(":memory:")` would be a distinct, empty
	 * database, defeating the point of reopening.
	 */
	private static fromConnection(db: Database.Database): BetterSqliteDriver {
		const driver = Object.create(
			BetterSqliteDriver.prototype,
		) as BetterSqliteDriver;
		driver.db = db;
		driver.writes = 0;
		driver.failNext = null;
		return driver;
	}

	execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
		if (this.failNext?.test(query)) {
			this.failNext = null;
			return Promise.reject(
				new Error(`BetterSqliteDriver: forced failure for "${query}"`),
			);
		}
		this.writes++;
		const info = this.db.prepare(query).run(...(bindValues as never[]));
		return Promise.resolve({
			rowsAffected: info.changes,
			lastInsertId: Number(info.lastInsertRowid),
		});
	}

	select<T>(query: string, bindValues: unknown[] = []): Promise<T[]> {
		const rows = this.db.prepare(query).all(...(bindValues as never[]));
		return Promise.resolve(rows as T[]);
	}

	async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
		// better-sqlite3's own `transaction()` helper only wraps synchronous
		// functions; `work` is async, so drive the statements by hand.
		await this.execute("BEGIN", []);
		try {
			const out = await work(this);
			await this.execute("COMMIT", []);
			return out;
		} catch (error) {
			await this.execute("ROLLBACK", []);
			throw error;
		}
	}

	/** A second driver over the same database, with no memoised state. */
	reopen(): BetterSqliteDriver {
		return BetterSqliteDriver.fromConnection(this.db);
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
