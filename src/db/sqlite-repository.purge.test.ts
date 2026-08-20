// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { ALL_MIGRATIONS } from "./migrations/index";
import { runMigrations } from "./migrations/run-migrations";
import { SqliteRepository } from "./sqlite-repository";

/**
 * Behavioural counterpart to the SQL-string assertions in
 * sqlite-repository.test.ts: those pin the shape of each statement, this pins
 * what the rows actually do. Real SQLite is what makes it possible to check the
 * property that matters — a purged task is invisible to every read while its
 * row survives — which a mocked driver cannot express.
 */

let driver: BetterSqliteDriver;
let repo: SqliteRepository;

// Ids captured at seed time; createTask generates them.
let liveId: string;
let purgedId: string;
let archivedId: string;
let archivedThenPurgedId: string;

interface RawTaskRow {
	id: string;
	title: string;
	description: string | null;
	purged_at: string | null;
	deleted_at: string | null;
}

// Reads the row directly, bypassing the repository's purged_at filters — the
// only way to observe that a tombstone still physically exists.
async function rawTask(id: string): Promise<RawTaskRow | undefined> {
	const rows = await driver.select<RawTaskRow>(
		"SELECT id, title, description, purged_at, deleted_at FROM tasks WHERE id = ?",
		[id],
	);
	return rows[0];
}

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	repo = new SqliteRepository(driver);

	liveId = (await repo.createTask({ title: "Live task" })).id;
	purgedId = (
		await repo.createTask({ title: "Purged task", description: "secret" })
	).id;
	archivedId = (await repo.createTask({ title: "Archived task" })).id;
	archivedThenPurgedId = (
		await repo.createTask({
			title: "Archived then purged",
			description: "secret too",
		})
	).id;

	await repo.deleteTask(purgedId);
	await repo.archiveTask(archivedId);
	// The doubly-marked row: archived first, then purged. It carries both
	// deleted_at and purged_at, so it is the one a missing filter resurfaces.
	await repo.archiveTask(archivedThenPurgedId);
	await repo.deleteTask(archivedThenPurgedId);
});

afterEach(() => driver?.close());

describe("SqliteRepository — purge behaviour against real SQLite", () => {
	it("getTasks returns only the live task, excluding both purged rows", async () => {
		const tasks = await repo.getTasks();
		expect(tasks.map((t) => t.id)).toEqual([liveId]);
	});

	it("getArchivedTasks returns the archived row but not the archived-then-purged one", async () => {
		const archived = await repo.getArchivedTasks();
		expect(archived.map((t) => t.id)).toEqual([archivedId]);
	});

	it("getTask returns null for a purged task", async () => {
		expect(await repo.getTask(purgedId)).toBeNull();
		expect(await repo.getTask(archivedThenPurgedId)).toBeNull();
		// Control: the filter must not swallow live rows.
		expect(await repo.getTask(liveId)).not.toBeNull();
	});

	it("keeps the purged rows in the table as blanked tombstones", async () => {
		for (const id of [purgedId, archivedThenPurgedId]) {
			const row = await rawTask(id);
			expect(row, `tombstone row for ${id} must survive`).toBeDefined();
			expect(row?.purged_at).not.toBeNull();
			expect(row?.title).toBe("");
			expect(row?.description).toBeNull();
			// Pins the rollback property: a client that predates purged_at must
			// see this row as archived, not as a live task, so deleted_at has to
			// be stamped alongside purged_at.
			expect(row?.deleted_at).not.toBeNull();
		}
	});

	it("keeps the archived row intact and readable", async () => {
		const row = await rawTask(archivedId);
		expect(row?.purged_at).toBeNull();
		expect(row?.deleted_at).not.toBeNull();
		expect(row?.title).toBe("Archived task");
	});
});
