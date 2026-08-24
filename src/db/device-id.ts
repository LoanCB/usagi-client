import type { DbDriver } from "./driver";

const KEY = "device_id";

// Per-driver cache. The value is stable on disk; this only avoids a SELECT on
// every stamped write, which is every write.
const cache = new WeakMap<DbDriver, string>();

/**
 * The identity this install writes into `field_updated_at`.
 *
 * It has to be genuinely unique per install, not per user and not per session:
 * spec §5 breaks LWW ties by comparing device ids lexicographically, so two
 * installs sharing a value make concurrent same-instant writes compare equal
 * and never converge.
 */
export async function getOrCreateDeviceId(db: DbDriver): Promise<string> {
	const cached = cache.get(db);
	if (cached) return cached;

	const rows = await db.select<{ value: string }>(
		"SELECT value FROM sync_state WHERE key = ?",
		[KEY],
	);
	const existing = rows[0]?.value;
	if (existing) {
		cache.set(db, existing);
		return existing;
	}

	const id = crypto.randomUUID();
	// INSERT OR IGNORE, not INSERT: two concurrent first calls would otherwise
	// race and the loser would overwrite the winner's id.
	await db.execute(
		"INSERT OR IGNORE INTO sync_state (key, value) VALUES (?, ?)",
		[KEY, id],
	);
	const settled = await db.select<{ value: string }>(
		"SELECT value FROM sync_state WHERE key = ?",
		[KEY],
	);
	const winner = settled[0]?.value ?? id;
	cache.set(db, winner);
	return winner;
}
