// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { deleteSyncState, getSyncState, setSyncState } from "./state";

let driver: BetterSqliteDriver;

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
});
afterEach(() => driver?.close());

describe("sync_state accessors", () => {
	it("reads null for an unset key", async () => {
		expect(await getSyncState(driver, "cursor")).toBeNull();
	});

	it("writes, overwrites and deletes a key", async () => {
		await setSyncState(driver, "cursor", "17");
		expect(await getSyncState(driver, "cursor")).toBe("17");
		await setSyncState(driver, "cursor", "42");
		expect(await getSyncState(driver, "cursor")).toBe("42");
		await deleteSyncState(driver, "cursor");
		expect(await getSyncState(driver, "cursor")).toBeNull();
	});

	it("works inside a DbDriver transaction (the outbox-drain requirement)", async () => {
		await driver.transaction(async (tx) => {
			await setSyncState(tx, "cursor", "7");
		});
		expect(await getSyncState(driver, "cursor")).toBe("7");
	});

	it("does not collide with the device_id key", async () => {
		await driver.execute(
			"INSERT INTO sync_state (key, value) VALUES ('device_id', 'dev-1')",
		);
		await setSyncState(driver, "cursor", "3");
		const rows = await driver.select<{ key: string }>(
			"SELECT key FROM sync_state ORDER BY key",
		);
		expect(rows.map((r) => r.key)).toEqual(["cursor", "device_id"]);
	});
});
