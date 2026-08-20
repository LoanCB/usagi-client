// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { ALL_MIGRATIONS } from "./index";
import { runMigrations } from "./run-migrations";

let driver: BetterSqliteDriver;

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
});
afterEach(() => driver?.close());

async function outbox(): Promise<{ entity_type: string; entity_id: string }[]> {
	return driver.select(
		"SELECT entity_type, entity_id FROM sync_outbox ORDER BY entity_id",
	);
}

async function insertTask(id: string) {
	await driver.execute(
		"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
		[id, id, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
	);
}

describe("sync_outbox triggers", () => {
	it("records an insert", async () => {
		await insertTask("t1");
		expect(await outbox()).toEqual([{ entity_type: "task", entity_id: "t1" }]);
	});

	it("records an update", async () => {
		await insertTask("t1");
		await driver.execute("DELETE FROM sync_outbox");
		await driver.execute("UPDATE tasks SET title = ? WHERE id = ?", [
			"new",
			"t1",
		]);
		expect(await outbox()).toEqual([{ entity_type: "task", entity_id: "t1" }]);
	});

	it("records a hard delete using the old row id", async () => {
		await insertTask("t1");
		await driver.execute("DELETE FROM sync_outbox");
		await driver.execute("DELETE FROM tasks WHERE id = ?", ["t1"]);
		expect(await outbox()).toEqual([{ entity_type: "task", entity_id: "t1" }]);
	});

	it("deduplicates repeated writes to one row", async () => {
		await insertTask("t1");
		await driver.execute("UPDATE tasks SET title = 'a' WHERE id = 't1'");
		await driver.execute("UPDATE tasks SET title = 'b' WHERE id = 't1'");
		expect(await outbox()).toHaveLength(1);
	});

	it("covers projects, tags and project_groups too", async () => {
		await driver.execute(
			"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES ('p1','P',0,'x','x')",
		);
		await driver.execute(
			"INSERT INTO tags (id, name, created_at, updated_at) VALUES ('g1','G','x','x')",
		);
		await driver.execute(
			"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES ('pg1','PG','#fff',0,'x','x')",
		);
		const types = (await outbox()).map((r) => r.entity_type).sort();
		expect(types).toEqual(["project", "project_group", "tag"]);
	});

	it("stamps dirtied_at as an ISO 8601 UTC timestamp", async () => {
		await insertTask("t1");
		const rows = await driver.select<{ dirtied_at: string }>(
			"SELECT dirtied_at FROM sync_outbox",
		);
		expect(rows[0]?.dirtied_at).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		);
	});
});
