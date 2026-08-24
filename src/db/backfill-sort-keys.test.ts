// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { backfillSortKeys } from "./backfill-sort-keys";
import { ALL_MIGRATIONS } from "./migrations";
import { runMigrations } from "./migrations/run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

interface SeedTask {
	id: string;
	sort_order?: number;
	created_at?: string;
}

async function seedTasks(d: BetterSqliteDriver, tasks: SeedTask[]) {
	for (const t of tasks) {
		await d.execute(
			"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			[
				t.id,
				t.id,
				t.sort_order ?? 0,
				t.created_at ?? "2026-01-01T00:00:00Z",
				"2026-01-01T00:00:00Z",
			],
		);
	}
}

async function seedTask(d: BetterSqliteDriver, id: string, order: number) {
	await seedTasks(d, [{ id, sort_order: order }]);
}

describe("backfillSortKeys", () => {
	it("assigns keys in the displayed order", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		// Seed rows whose sort_order/created_at order is known, then assert the
		// backfilled keys sort the same way.
		await seedTasks(driver, [
			{ id: "b", sort_order: 1, created_at: "2026-01-02" },
			{ id: "a", sort_order: 0, created_at: "2026-01-01" },
			{ id: "c", sort_order: 2, created_at: "2026-01-03" },
		]);
		await backfillSortKeys(driver);
		const rows = await driver.select<{ id: string }>(
			"SELECT id FROM tasks ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});

	it("gives every row a key, leaving none null", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTasks(driver, [{ id: "a" }, { id: "b" }]);
		await backfillSortKeys(driver);
		const rows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE sort_key IS NULL",
		);
		expect(rows[0].n).toBe(0);
	});

	it("produces strictly increasing keys with no duplicates", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		// The collision this guards against is exactly what the pre-existing data
		// suffered: two rows sharing a key have no defined relative order, and the
		// list silently reshuffles between reloads.
		await seedTasks(
			driver,
			Array.from({ length: 50 }, (_, i) => ({ id: `t${i}` })),
		);
		await backfillSortKeys(driver);
		const rows = await driver.select<{ sort_key: string }>(
			"SELECT sort_key FROM tasks ORDER BY sort_key",
		);
		const keys = rows.map((r) => r.sort_key);
		expect(new Set(keys).size).toBe(keys.length);
		expect([...keys].sort()).toEqual(keys);
	});

	it("is idempotent once every row has a key", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTasks(driver, [{ id: "a" }, { id: "b" }]);
		await backfillSortKeys(driver);
		const before = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY id",
		);
		await backfillSortKeys(driver);
		const after = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY id",
		);
		expect(after).toEqual(before);
	});

	it("backfills projects and project_groups too, not just tasks", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await driver.execute(
			"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			["g1", "Group", "#fff", 0, "2026-01-01", "2026-01-01"],
		);
		for (const [id, order] of [
			["p_b", 1],
			["p_a", 0],
		] as const) {
			await driver.execute(
				"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
				[id, id, order, "2026-01-01", "2026-01-01"],
			);
		}

		await backfillSortKeys(driver);

		const groupRows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM project_groups WHERE sort_key IS NULL",
		);
		expect(groupRows[0].n).toBe(0);

		const projectRows = await driver.select<{ id: string }>(
			"SELECT id FROM projects ORDER BY sort_key",
		);
		expect(projectRows.map((r) => r.id)).toEqual(["p_a", "p_b"]);
	});

	it("keys projects and project_groups into one shared space, interleaved", async () => {
		// The test above only checks each table against itself, so per-table keying
		// passes it. This one pins the property that actually matters: the sidebar's
		// top level interleaves groups and projects, and before fractional keys they
		// shared a single sort_order number line. Keying each table on its own
		// restarts both at "a0", collapsing that line into a wall of ties — and the
		// migration is version-gated, so it destroys the user's order for good.
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		// sort_order values interleave deliberately: groups at 0 and 2, projects at
		// 1 and 3, so the legacy order alternates between the two tables.
		for (const [id, order] of [
			["g_first", 0],
			["g_third", 2],
		] as const) {
			await driver.execute(
				"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				[id, id, "#fff", order, "2026-01-01", "2026-01-01"],
			);
		}
		for (const [id, order] of [
			["p_second", 1],
			["p_fourth", 3],
		] as const) {
			await driver.execute(
				"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
				[id, id, order, "2026-01-01", "2026-01-01"],
			);
		}

		await backfillSortKeys(driver);

		const rows = await driver.select<{ id: string; sort_key: string }>(
			`SELECT id, sort_key FROM project_groups
			 UNION ALL SELECT id, sort_key FROM projects
			 ORDER BY sort_key`,
		);
		// Distinctness first: per-table keying hands both tables "a0", and a tie
		// would let the order assertion below pass on whichever row SQLite happened
		// to return first.
		const keys = rows.map((r) => r.sort_key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(rows.map((r) => r.id)).toEqual([
			"g_first",
			"p_second",
			"g_third",
			"p_fourth",
		]);
	});

	it("keeps new rows after a re-run past the previous maximum, not colliding with it", async () => {
		// This is the corruption the migration exists to erase: a row created
		// after the first backfill has no key yet, and re-running the backfill
		// must anchor it after the current max instead of restarting from "a0",
		// which would collide with whatever untouched row already holds that key.
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTasks(
			driver,
			Array.from({ length: 50 }, (_, i) => ({ id: `t${i}` })),
		);
		await backfillSortKeys(driver);
		const before = await driver.select<{ sort_key: string }>(
			"SELECT sort_key FROM tasks ORDER BY sort_key",
		);

		await seedTask(driver, "late", 0);
		await backfillSortKeys(driver);

		const rows = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY sort_key",
		);
		const keys = rows.map((r) => r.sort_key);
		expect(new Set(keys).size).toBe(keys.length);
		expect([...keys].sort()).toEqual(keys);
		// Every previously-assigned key must survive unchanged.
		expect(keys.slice(0, 50)).toEqual(before.map((r) => r.sort_key));
		expect(rows[rows.length - 1]?.id).toBe("late");
	});

	it("rolls back every table if a later write in the transaction fails", async () => {
		// A crash halfway through must not leave tasks keyed while
		// project_groups/projects stay null: that half-ordered state is worse than
		// the uniformly-null state the next run can still finish cleanly.
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTasks(driver, [{ id: "a" }, { id: "b" }]);
		await driver.execute(
			"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			["g1", "Group", "#fff", 0, "2026-01-01", "2026-01-01"],
		);
		driver.failNextExecuteMatching(/UPDATE project_groups SET sort_key/);

		await expect(backfillSortKeys(driver)).rejects.toThrow();

		const rows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE sort_key IS NULL",
		);
		expect(rows[0].n).toBe(2);
	});

	// createTask/createProject hardcode sort_order to 0, so ties on
	// (sort_order, created_at) are the normal case, not an edge case. The
	// backfill must freeze whatever order the app's own query actually returns.
	it("matches the app's own ordering when rows tie on sort_order and created_at", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		// Inserted in an order that differs from lexical id order, so an id-based
		// tie-break would visibly diverge from what the app query returns.
		for (const id of ["c", "a", "b"]) {
			await seedTask(driver, id, 0);
		}

		await backfillSortKeys(driver);

		// Compare against the app's real ordering clause (sqlite-repository.ts)
		// rather than a hardcoded list, so this stays honest if ties ever shift.
		const appOrder = await driver.select<{ id: string }>(
			"SELECT id FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
		);
		const keyOrder = await driver.select<{ id: string }>(
			"SELECT id FROM tasks ORDER BY sort_key",
		);
		expect(keyOrder.map((r) => r.id)).toEqual(appOrder.map((r) => r.id));
	});

	it("handles an empty table without throwing", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await expect(backfillSortKeys(driver)).resolves.toBeUndefined();
	});
});
