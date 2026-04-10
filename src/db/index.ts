import type { DbDriver, QueryResult } from "./driver";
import type { TodoRepository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";
import Database from "@tauri-apps/plugin-sql";

export type { TodoRepository } from "./repository";

function adaptDatabase(db: Database): DbDriver {
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
  };
}

export function createRepository(db: Database): TodoRepository {
  return new SqliteRepository(adaptDatabase(db));
}
