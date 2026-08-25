import type { DbDriver } from "@/db/driver";

/**
 * Key/value rows in sync_state (migration 009). device_id is owned by
 * db/device-id.ts and deliberately absent from this union: the engine reads it
 * through getOrCreateDeviceId, never raw.
 */
export type SyncStateKey =
	| "server_url"
	| "cursor"
	| "clock_offset_ms"
	| "refresh_token"
	| "user_id"
	| "account_email"
	| "first_sync_resolved"
	| "last_sync_at";

export async function getSyncState(
	db: DbDriver,
	key: SyncStateKey,
): Promise<string | null> {
	const rows = await db.select<{ value: string }>(
		"SELECT value FROM sync_state WHERE key = ?",
		[key],
	);
	return rows[0]?.value ?? null;
}

export async function setSyncState(
	db: DbDriver,
	key: SyncStateKey,
	value: string,
): Promise<void> {
	await db.execute(
		"INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
		[key, value],
	);
}

export async function deleteSyncState(
	db: DbDriver,
	key: SyncStateKey,
): Promise<void> {
	await db.execute("DELETE FROM sync_state WHERE key = ?", [key]);
}
