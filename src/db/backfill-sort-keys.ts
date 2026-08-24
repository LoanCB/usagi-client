import { generateNKeysBetween } from "fractional-indexing";
import type { DbDriver } from "./driver";

type OrderedTable = "tasks" | "projects" | "project_groups";

/**
 * One entry per key space, not per table.
 *
 * projects and project_groups are backfilled together because the sidebar's top
 * level interleaves them: keying each table on its own would restart both at the
 * same first key, collapsing the single sort_order number line they used to
 * share into a wall of ties.
 */
const KEY_SPACES: readonly (readonly OrderedTable[])[] = [
	["tasks"],
	["projects", "project_groups"],
];

/**
 * Fill sort_key for rows that have none, preserving the order sort_order gave
 * them. Runs after every migration pass: it is idempotent, so rows keyed by an
 * earlier run keep their value and stay stable across devices.
 */
export async function backfillSortKeys(db: DbDriver): Promise<void> {
	// One transaction across all key spaces: a crash halfway through must not
	// leave some tables keyed and others not — that is a half-ordered database,
	// which is worse than one that is uniformly unkeyed (the next run finishes
	// it cleanly instead).
	await db.transaction(async (tx) => {
		for (const space of KEY_SPACES) {
			// The app orders by (sort_order, created_at) with no further tie-break, and
			// creates rows with sort_order = 0, so ties are the normal case. SQLite
			// leaves the order of tied rows unspecified, so there is no guaranteed
			// pre-existing order to preserve; rowid is what it actually returns for
			// these queries today, so tie-breaking on it freezes the currently visible
			// order instead of silently reshuffling it (an id/UUID tie-break would).
			// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: each key space is a separate ordered backfill; concurrency would interleave writes on one SQLite connection
			const rows = await tx.select<{ tbl: OrderedTable; id: string }>(
				`${space
					.map(
						(table) =>
							`SELECT '${table}' AS tbl, id, sort_order, created_at, rowid AS rid FROM ${table} WHERE sort_key IS NULL`,
					)
					.join(
						" UNION ALL ",
					)} ORDER BY sort_order ASC, created_at ASC, rid ASC`,
			);
			if (rows.length === 0) continue;

			// Anchor after the highest existing key in the space so a partial
			// backfill stays ordered.
			// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: sequential per-space step within the same transaction
			const maxRows = await tx.select<{ max_key: string | null }>(
				space
					.map((table) => `SELECT MAX(sort_key) AS max_key FROM ${table}`)
					.join(" UNION ALL "),
			);
			const after = maxRows
				.map((r) => r.max_key)
				.filter((k): k is string => k !== null)
				.reduce<string | null>(
					(highest, k) => (k > (highest ?? "") ? k : highest),
					null,
				);
			const keys = generateNKeysBetween(after, null, rows.length);

			for (let i = 0; i < rows.length; i++) {
				// The table name comes from the literal injected above, never from
				// user data, but re-checking it against the space keeps the closed-set
				// property that makes the interpolation safe to read.
				const table = space.find((t) => t === rows[i].tbl);
				if (!table) continue;
				// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: ordered writes on a single SQLite connection
				await tx.execute(`UPDATE ${table} SET sort_key = ? WHERE id = ?`, [
					keys[i],
					rows[i].id,
				]);
			}
		}
	});
}
