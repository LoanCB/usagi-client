import type Database from "@tauri-apps/plugin-sql";
import type { DbDriver, QueryResult } from "./driver";
import type { TodoRepository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";

export type { TodoRepository } from "./repository";

export function adaptDatabase(db: Database): DbDriver {
	return {
		async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
			const result = await db.execute(query, bindValues);
			return {
				rowsAffected: result.rowsAffected,
				lastInsertId: result.lastInsertId ?? 0,
			};
		},
		async select<T>(query: string, bindValues?: unknown[]): Promise<T[]> {
			return db.select<T[]>(query, bindValues);
		},
		async transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T> {
			// tauri-plugin-sql has no transaction API of its own; the statements go
			// through execute like any other. Nested calls are not supported — SQLite
			// would reject the inner BEGIN — and nothing in this codebase nests.
			await this.execute("BEGIN", []);
			try {
				const out = await work(this);
				await this.execute("COMMIT", []);
				return out;
			} catch (error) {
				try {
					await this.execute("ROLLBACK", []);
				} catch {
					// A failing ROLLBACK must not replace the error being handled: the
					// original is the one explaining why the transaction aborted.
					// `Error.cause` would carry both, but it needs an ES2022 lib and
					// this project targets ES2020.
				}
				throw error;
			}
		},
	};
}

export function createRepository(db: Database): TodoRepository {
	return new SqliteRepository(adaptDatabase(db));
}
