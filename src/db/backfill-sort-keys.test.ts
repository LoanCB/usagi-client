// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { backfillSortKeys } from "./backfill-sort-keys";
import { ALL_MIGRATIONS } from "./migrations";
import { runMigrations } from "./migrations/run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

async function seedTask(d: BetterSqliteDriver, id: string, order: number) {
	await d.execute(
		"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		[id, id, order, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
	);
}

describe("backfillSortKeys", () => {
	it("assigns keys that sort in the same order as sort_order", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTask(driver, "c", 2);
		await seedTask(driver, "a", 0);
		await seedTask(driver, "b", 1);

		await backfillSortKeys(driver);

		const rows = await driver.select<{ id: string }>(
			"SELECT id FROM tasks ORDER BY sort_key",
		);
		expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});

	it("never leaves a null sort_key", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTask(driver, "a", 0);
		await backfillSortKeys(driver);
		const rows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks WHERE sort_key IS NULL",
		);
		expect(rows[0]?.n).toBe(0);
	});

	it("is idempotent and leaves already-keyed rows untouched", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await seedTask(driver, "a", 0);
		await seedTask(driver, "b", 1);
		await backfillSortKeys(driver);
		const first = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY id",
		);
		await backfillSortKeys(driver);
		const second = await driver.select<{ id: string; sort_key: string }>(
			"SELECT id, sort_key FROM tasks ORDER BY id",
		);
		expect(second).toEqual(first);
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
