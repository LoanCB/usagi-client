import Database from "better-sqlite3";
import type { DbDriver, QueryResult } from "@/db/driver";

/**
 * Real SQLite behind the DbDriver interface, for tests that must exercise
 * actual SQL: migrations, triggers, CHECK constraints. The production driver
 * wraps tauri-plugin-sql, which cannot run outside a Tauri process.
 */
export class BetterSqliteDriver implements DbDriver {
	private db: Database.Database;

	constructor(filename = ":memory:") {
		this.db = new Database(filename);
		// Match tauri-plugin-sql, which enables FK enforcement per connection.
		this.db.pragma("foreign_keys = ON");
	}

	execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
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

	close(): void {
		this.db.close();
	}
}
