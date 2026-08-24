export interface QueryResult {
	rowsAffected: number;
	lastInsertId: number;
}

export interface DbDriver {
	execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
	select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
	/**
	 * Run `work` atomically. Everything it writes commits together or not at all.
	 *
	 * The sync engine needs this to purge an outbox entry in the same transaction
	 * that applies the remote change it came from: split across two commits, a
	 * crash in between either replays the change forever or drops it silently.
	 *
	 * The driver handed to `work` is the transactional one — use it, not the outer
	 * driver, or the write escapes the transaction.
	 */
	transaction<T>(work: (tx: DbDriver) => Promise<T>): Promise<T>;
}
