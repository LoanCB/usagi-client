import { generateNKeysBetween } from "fractional-indexing";
import type { DbDriver } from "./driver";

const ORDERED_TABLES = ["tasks", "projects", "project_groups"] as const;

/**
 * Fill sort_key for rows that have none, preserving the order sort_order gave
 * them. Runs after every migration pass: it is idempotent, so rows keyed by an
 * earlier run keep their value and stay stable across devices.
 */
export async function backfillSortKeys(db: DbDriver): Promise<void> {
	for (const table of ORDERED_TABLES) {
		// The app orders by (sort_order, created_at) with no further tie-break, and
		// creates rows with sort_order = 0, so ties are the normal case. SQLite
		// leaves the order of tied rows unspecified, so there is no guaranteed
		// pre-existing order to preserve; rowid is what it actually returns for
		// these queries today, so tie-breaking on it freezes the currently visible
		// order instead of silently reshuffling it (an id/UUID tie-break would).
		// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: each table is a separate ordered backfill; concurrency would interleave writes on one SQLite connection
		const rows = await db.select<{ id: string }>(
			`SELECT id FROM ${table} WHERE sort_key IS NULL ORDER BY sort_order ASC, created_at ASC, rowid ASC`,
		);
		if (rows.length === 0) continue;

		// Anchor after the highest existing key so a partial backfill stays ordered.
		const maxRows = await db.select<{ max_key: string | null }>(
			`SELECT MAX(sort_key) AS max_key FROM ${table}`,
		);
		const after = maxRows[0]?.max_key ?? null;
		const keys = generateNKeysBetween(after, null, rows.length);

		for (let i = 0; i < rows.length; i++) {
			// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: ordered writes on a single SQLite connection
			await db.execute(`UPDATE ${table} SET sort_key = ? WHERE id = ?`, [
				keys[i],
				rows[i].id,
			]);
		}
	}
}
