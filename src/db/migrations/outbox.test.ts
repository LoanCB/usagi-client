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

/**
 * One entry per synced table. The 12 triggers are written out longhand in the
 * migration (SQLite has no parameterised trigger), so a wrong table name,
 * entity_type literal or NEW/OLD alias is the failure mode this file guards
 * against. Driving the cases from this array keeps all 12 executed, and makes a
 * thirteenth trigger one entry rather than another block of copy-paste.
 */
const SYNCED_ENTITIES = [
	{
		table: "tasks",
		entityType: "task",
		id: "t1",
		insertSql:
			"INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES ('t1','T',0,'x','x')",
	},
	{
		table: "projects",
		entityType: "project",
		id: "p1",
		insertSql:
			"INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES ('p1','P',0,'x','x')",
	},
	{
		table: "tags",
		entityType: "tag",
		id: "g1",
		insertSql:
			"INSERT INTO tags (id, name, created_at, updated_at) VALUES ('g1','G','x','x')",
	},
	{
		table: "project_groups",
		entityType: "project_group",
		id: "pg1",
		insertSql:
			"INSERT INTO project_groups (id, name, color, sort_order, created_at, updated_at) VALUES ('pg1','PG','#fff',0,'x','x')",
	},
] as const;

describe.each(SYNCED_ENTITIES)("sync_outbox triggers on $table", ({
	table,
	entityType,
	id,
	insertSql,
}) => {
	it("records an insert", async () => {
		await driver.execute(insertSql);
		expect(await outbox()).toEqual([
			{ entity_type: entityType, entity_id: id },
		]);
	});

	it("records an update", async () => {
		await driver.execute(insertSql);
		await driver.execute("DELETE FROM sync_outbox");
		await driver.execute(`UPDATE ${table} SET updated_at = ? WHERE id = ?`, [
			"2026-02-02T00:00:00Z",
			id,
		]);
		expect(await outbox()).toEqual([
			{ entity_type: entityType, entity_id: id },
		]);
	});

	// Asserting the id survives the delete is what separates a correct trigger
	// from one reading NEW.id: the row is gone, so only OLD.id can supply it.
	it("records a hard delete using the old row id", async () => {
		await driver.execute(insertSql);
		await driver.execute("DELETE FROM sync_outbox");
		await driver.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
		expect(await outbox()).toEqual([
			{ entity_type: entityType, entity_id: id },
		]);
	});
});

describe("sync_outbox dirty-set semantics", () => {
	it("deduplicates repeated writes to one row", async () => {
		await insertTask("t1");
		await driver.execute("UPDATE tasks SET title = 'a' WHERE id = 't1'");
		await driver.execute("UPDATE tasks SET title = 'b' WHERE id = 't1'");
		expect(await outbox()).toHaveLength(1);
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
