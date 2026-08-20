// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { backfillSortKeys } from "@/db/backfill-sort-keys";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { ALL_MIGRATIONS } from "./index";
import { runMigrations } from "./run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

async function columns(
	d: BetterSqliteDriver,
	table: string,
): Promise<string[]> {
	const rows = await d.select<{ name: string }>(`PRAGMA table_info(${table})`);
	return rows.map((r) => r.name);
}

const SYNCED_TABLES = ["tasks", "projects", "tags", "project_groups"];

describe("migrations", () => {
	it("applies the full chain on a fresh database", async () => {
		driver = new BetterSqliteDriver();
		await expect(
			runMigrations(driver, ALL_MIGRATIONS),
		).resolves.toBeUndefined();
	});

	it("adds field_updated_at and purged_at to every synced table", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		for (const table of SYNCED_TABLES) {
			const cols = await columns(driver, table);
			expect(cols, `${table}.field_updated_at`).toContain("field_updated_at");
			expect(cols, `${table}.purged_at`).toContain("purged_at");
		}
	});

	it("keeps sort_order so the migration stays reversible", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		expect(await columns(driver, "tasks")).toContain("sort_order");
	});

	it("preserves existing rows through the migration", async () => {
		driver = new BetterSqliteDriver();
		// Stop before 007 to seed a pre-migration database.
		await runMigrations(driver, ALL_MIGRATIONS.slice(0, 6));
		await driver.execute(
			"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			["t1", "Legacy task", 3, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
		);
		await runMigrations(driver, ALL_MIGRATIONS);
		const rows = await driver.select<{
			title: string;
			purged_at: string | null;
		}>("SELECT title, purged_at FROM tasks WHERE id = ?", ["t1"]);
		expect(rows[0]).toEqual({ title: "Legacy task", purged_at: null });
	});

	it("migrates a populated legacy database without losing data", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS.slice(0, 6));
		await driver.execute(
			"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES ('p1','Work',0,'x','x')",
		);
		for (let i = 0; i < 50; i++) {
			await driver.execute(
				"INSERT INTO tasks (id, title, project_id, sort_order, created_at, updated_at) VALUES (?, ?, 'p1', ?, 'x', 'x')",
				[`t${i}`, `Task ${i}`, i],
			);
		}
		await runMigrations(driver, ALL_MIGRATIONS);
		await backfillSortKeys(driver);

		const rows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks",
		);
		expect(rows[0]?.n).toBe(50);
		const ordered = await driver.select<{ id: string }>(
			"SELECT id FROM tasks ORDER BY sort_key LIMIT 3",
		);
		expect(ordered.map((r) => r.id)).toEqual(["t0", "t1", "t2"]);
	});

	it("re-runs cleanly on a fully migrated database whose user_version was reset to 0", async () => {
		// Simulates an installation from before user_version tracking existed:
		// the schema is already at the latest shape, but the tracked version is
		// stale. runMigrations must tolerate "already applied" DDL across the
		// whole chain, not just the last migration covered by the other tests.
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS);
		await driver.execute(
			"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES ('p1','Work',0,'x','x')",
		);
		for (let i = 0; i < 50; i++) {
			await driver.execute(
				"INSERT INTO tasks (id, title, project_id, sort_order, created_at, updated_at) VALUES (?, ?, 'p1', ?, 'x', 'x')",
				[`t${i}`, `Task ${i}`, i],
			);
		}
		await backfillSortKeys(driver);

		await driver.execute("PRAGMA user_version = 0");

		await expect(
			runMigrations(driver, ALL_MIGRATIONS),
		).resolves.toBeUndefined();

		const versionRows = await driver.select<{ user_version: number }>(
			"PRAGMA user_version",
		);
		expect(versionRows[0]?.user_version).toBe(ALL_MIGRATIONS.length);

		const rows = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM tasks",
		);
		expect(rows[0]?.n).toBe(50);

		for (const table of SYNCED_TABLES) {
			const cols = await columns(driver, table);
			expect(cols, `${table}.field_updated_at`).toContain("field_updated_at");
			expect(cols, `${table}.purged_at`).toContain("purged_at");
		}
		expect(await columns(driver, "tasks")).toContain("sort_key");
		expect(await columns(driver, "projects")).toContain("sort_key");
		expect(await columns(driver, "project_groups")).toContain("sort_key");
	});
});
