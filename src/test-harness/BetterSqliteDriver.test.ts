// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "./BetterSqliteDriver";

let driver: BetterSqliteDriver;

afterEach(() => driver?.close());

describe("BetterSqliteDriver", () => {
	it("executes DDL and returns rows from select", async () => {
		driver = new BetterSqliteDriver();
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)");
		const res = await driver.execute("INSERT INTO t (id, n) VALUES (?, ?)", [
			"a",
			1,
		]);
		expect(res.rowsAffected).toBe(1);
		const rows = await driver.select<{ id: string; n: number }>(
			"SELECT id, n FROM t WHERE id = ?",
			["a"],
		);
		expect(rows).toEqual([{ id: "a", n: 1 }]);
	});

	it("enforces foreign keys so migration behaviour matches production", async () => {
		driver = new BetterSqliteDriver();
		const rows = await driver.select<{ foreign_keys: number }>(
			"PRAGMA foreign_keys",
		);
		expect(rows[0]?.foreign_keys).toBe(1);
	});
	it("hands every transaction the same driver view", async () => {
		driver = new BetterSqliteDriver();
		// Callers key per-connection caches on the object they are given —
		// getOrCreateDeviceId keys a WeakMap on it. A fresh view per transaction
		// would miss that cache every time, so tests would exercise an extra read
		// production never performs.
		const seen: unknown[] = [];
		await driver.transaction(async (tx) => {
			seen.push(tx);
		});
		await driver.transaction(async (tx) => {
			seen.push(tx);
		});
		expect(seen[0]).toBe(seen[1]);
	});

	it("gives a reopened driver its own view, as a restart would", async () => {
		driver = new BetterSqliteDriver();
		let first: unknown;
		await driver.transaction(async (tx) => {
			first = tx;
		});
		const restarted = driver.reopen();
		let second: unknown;
		await restarted.transaction(async (tx) => {
			second = tx;
		});
		expect(second).not.toBe(first);
	});
});
