import { beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "../test-harness/BetterSqliteDriver";
import { getOrCreateDeviceId } from "./device-id";
import { ALL_MIGRATIONS } from "./migrations/index";
import { runMigrations } from "./migrations/run-migrations";

describe("getOrCreateDeviceId", () => {
	let db: BetterSqliteDriver;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
	});

	it("creates an id on first call and persists it in sync_state", async () => {
		const id = await getOrCreateDeviceId(db);
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		const rows = await db.select<{ value: string }>(
			"SELECT value FROM sync_state WHERE key = 'device_id'",
		);
		expect(rows[0]?.value).toBe(id);
	});

	it("returns the same id on a later call", async () => {
		const first = await getOrCreateDeviceId(db);
		const second = await getOrCreateDeviceId(db);
		expect(second).toBe(first);
	});

	it("survives a fresh driver over the same database", async () => {
		// Memoisation must not be the only thing keeping the id stable — a
		// device that changed identity between launches would break LWW
		// tie-breaks silently.
		const first = await getOrCreateDeviceId(db);
		const again = await getOrCreateDeviceId(db.reopen());
		expect(again).toBe(first);
	});

	it("is not the placeholder", async () => {
		expect(await getOrCreateDeviceId(db)).not.toBe("local");
	});

	it("differs between two devices", async () => {
		const other = new BetterSqliteDriver();
		await runMigrations(other, ALL_MIGRATIONS);
		expect(await getOrCreateDeviceId(db)).not.toBe(
			await getOrCreateDeviceId(other),
		);
	});
});
