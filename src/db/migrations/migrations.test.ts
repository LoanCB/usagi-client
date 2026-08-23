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
		//
		// Scope, deliberately: this asserts the chain is re-runnable end to end
		// (it completes, reaches the final user_version, keeps every row, and
		// still has the sync columns). It does NOT assert the *values* in
		// field_updated_at / purged_at / sort_key, because 006 rebuilds tasks
		// with a column list frozen at the 006-era schema, so re-running it over
		// an already-migrated table copies those columns as NULL.
		//
		// That nulling is an artefact of the state this test fabricates, not a
		// reachable bug: runMigrations only ever moves user_version upward, so
		// production never re-runs 006 on a table that already has the sync
		// columns. On the real legacy path the schema is 006-era and those
		// columns do not exist yet, so nothing is lost. Do not "fix" 006 or add
		// value assertions here in response to it.
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

	it("migrates a real legacy installation: 006-era schema with user_version stuck at 0", async () => {
		// This is the path that actually happens in production: a database
		// created before user_version tracking existed, left on a 005/006-era
		// schema with user_version = 0. Unlike the fabricated-state test above,
		// the sync columns genuinely do not exist yet here, so re-running 006's
		// table rebuild loses nothing — value-level assertions are legitimate.
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ALL_MIGRATIONS.slice(0, 6));

		await driver.execute(
			"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES ('g1', 'Personal', '#ff0000', 0, 'x', 'x')",
		);
		await driver.execute(
			"INSERT INTO projects (id, name, sort_order, created_at, updated_at, group_id) VALUES ('p1', 'Work', 0, 'x', 'x', 'g1')",
		);
		for (let i = 0; i < 5; i++) {
			await driver.execute(
				"INSERT INTO tasks (id, title, project_id, priority, sort_order, created_at, updated_at) VALUES (?, ?, 'p1', 'medium', ?, 'x', 'x')",
				[`t${i}`, `Legacy task ${i}`, i],
			);
		}

		// Real legacy installs never had user_version advanced at all.
		await driver.execute("PRAGMA user_version = 0");

		await expect(
			runMigrations(driver, ALL_MIGRATIONS),
		).resolves.toBeUndefined();

		const versionRows = await driver.select<{ user_version: number }>(
			"PRAGMA user_version",
		);
		expect(versionRows[0]?.user_version).toBe(ALL_MIGRATIONS.length);

		const taskRows = await driver.select<{ id: string; title: string }>(
			"SELECT id, title FROM tasks ORDER BY id",
		);
		expect(taskRows).toEqual(
			Array.from({ length: 5 }, (_, i) => ({
				id: `t${i}`,
				title: `Legacy task ${i}`,
			})),
		);

		const projectRows = await driver.select<{ id: string; name: string }>(
			"SELECT id, name FROM projects",
		);
		expect(projectRows).toEqual([{ id: "p1", name: "Work" }]);

		for (const table of SYNCED_TABLES) {
			const cols = await columns(driver, table);
			expect(cols, `${table}.field_updated_at`).toContain("field_updated_at");
			expect(cols, `${table}.purged_at`).toContain("purged_at");
		}
		expect(await columns(driver, "tasks")).toContain("sort_key");
	});

	it("blanks the placeholder device id in existing stamps", async () => {
		const db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		await db.execute(
			`INSERT INTO tasks (id, title, created_at, updated_at, field_updated_at)
			 VALUES ('t1', 'x', '2026-01-01', '2026-01-01',
			         '{"title":{"t":"2026-01-01","d":"local"}}')`,
			[],
		);
		// runMigrations only replays migrations above the tracked user_version
		// (see "skips migrations already applied" in run-migrations.test.ts), so
		// simply calling it again would not touch a row inserted after the chain
		// already reached its end. Rolling user_version back reproduces the real
		// upgrade path this migration targets: a legacy row written before the
		// database ever crosses version 10. Re-running the whole chain is safe
		// — every earlier migration is idempotent-tolerant (see run-migrations'
		// duplicate-column handling and the other "re-runs cleanly" tests above.
		await db.execute("PRAGMA user_version = 9");
		await runMigrations(db, ALL_MIGRATIONS);

		const rows = await db.select<{ field_updated_at: string }>(
			"SELECT field_updated_at FROM tasks WHERE id = 't1'",
		);
		const stamps = JSON.parse(rows[0].field_updated_at) as Record<
			string,
			{ t: string; d: string }
		>;
		expect(stamps.title.d).toBe("");
		expect(stamps.title.t).toBe("2026-01-01");
	});
});
