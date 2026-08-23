import { beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "../test-harness/BetterSqliteDriver";

describe("DbDriver.transaction", () => {
	let db: BetterSqliteDriver;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await db.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)", []);
	});

	it("commits every write when the callback resolves", async () => {
		await db.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id, v) VALUES ('a', '1')", []);
			await tx.execute("INSERT INTO t (id, v) VALUES ('b', '2')", []);
		});
		const rows = await db.select<{ id: string }>(
			"SELECT id FROM t ORDER BY id",
		);
		expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
	});

	it("rolls every write back when the callback throws", async () => {
		// The whole point: the sync engine purges its outbox entries in the same
		// transaction that applies a remote change. A half-applied pair would
		// either replay a change forever or drop it silently.
		await expect(
			db.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id, v) VALUES ('a', '1')", []);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		const rows = await db.select<{ id: string }>("SELECT id FROM t");
		expect(rows).toEqual([]);
	});

	it("returns the callback's value", async () => {
		const out = await db.transaction(async () => 42);
		expect(out).toBe(42);
	});

	it("rolls back a write that fails on a constraint", async () => {
		await db.execute("INSERT INTO t (id, v) VALUES ('a', '1')", []);
		await expect(
			db.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id, v) VALUES ('b', '2')", []);
				await tx.execute("INSERT INTO t (id, v) VALUES ('a', 'dup')", []);
			}),
		).rejects.toThrow();
		const rows = await db.select<{ id: string }>(
			"SELECT id FROM t ORDER BY id",
		);
		expect(rows.map((r) => r.id)).toEqual(["a"]);
	});
});
