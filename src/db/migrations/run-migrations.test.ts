// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { runMigrations } from "./run-migrations";

let driver: BetterSqliteDriver;
afterEach(() => driver?.close());

async function userVersion(d: BetterSqliteDriver): Promise<number> {
	const rows = await d.select<{ user_version: number }>("PRAGMA user_version");
	return rows[0]?.user_version ?? 0;
}

describe("runMigrations", () => {
	it("applies every migration and advances user_version", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, [
			"CREATE TABLE a (id TEXT PRIMARY KEY);",
			"CREATE TABLE b (id TEXT PRIMARY KEY);",
		]);
		expect(await userVersion(driver)).toBe(2);
	});

	it("skips migrations already applied", async () => {
		driver = new BetterSqliteDriver();
		await runMigrations(driver, ["CREATE TABLE a (id TEXT PRIMARY KEY);"]);
		// Re-running with the same list must not fail on "table a already exists".
		await runMigrations(driver, ["CREATE TABLE a (id TEXT PRIMARY KEY);"]);
		expect(await userVersion(driver)).toBe(1);
	});

	it("tolerates duplicate-column errors from legacy re-runs", async () => {
		driver = new BetterSqliteDriver();
		await driver.execute("CREATE TABLE a (id TEXT PRIMARY KEY, extra TEXT)");
		await runMigrations(driver, ["ALTER TABLE a ADD COLUMN extra TEXT;"]);
		expect(await userVersion(driver)).toBe(1);
	});

	it("throws on a real error instead of advancing user_version", async () => {
		driver = new BetterSqliteDriver();
		await expect(
			runMigrations(driver, ["CREATE TABLE (((;"]),
		).rejects.toThrow();
		expect(await userVersion(driver)).toBe(0);
	});
});
