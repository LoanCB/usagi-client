// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
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
});
