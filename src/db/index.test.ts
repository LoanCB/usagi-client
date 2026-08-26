import type Database from "@tauri-apps/plugin-sql";
import BetterSqlite from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { adaptDatabase } from "./index";

/**
 * A stand-in for tauri-plugin-sql's Database backed by ONE real SQLite
 * connection — the production contract once the Rust side pins the sqlx pool
 * to a single connection (src-tauri/src/db.rs). What this mock cannot
 * reproduce is the other half of the defect, a multi-connection pool
 * scattering the statements of one raw BEGIN/COMMIT across connections: that
 * mechanism lives in sqlx and is covered by the Rust tests instead.
 */
function fakeSingleConnectionDb(): Database {
	const conn = new BetterSqlite(":memory:");
	return {
		async execute(query: string, bindValues: unknown[] = []) {
			const info = conn.prepare(query).run(...(bindValues as never[]));
			return {
				rowsAffected: info.changes,
				lastInsertId: Number(info.lastInsertRowid),
			};
		},
		async select(query: string, bindValues: unknown[] = []) {
			return conn.prepare(query).all(...(bindValues as never[]));
		},
	} as unknown as Database;
}

/**
 * A promise plus its resolver, so a test can hold a transaction open at a
 * known point. Without it the interleaving depends on how many microtasks the
 * adapter happens to await before its BEGIN lands.
 */
function barrier(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { wait, open };
}

describe("adaptDatabase.transaction", () => {
	it("commits every write when the callback resolves", async () => {
		const driver = adaptDatabase(fakeSingleConnectionDb());
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
		await driver.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id) VALUES ('a')");
			await tx.execute("INSERT INTO t (id) VALUES ('b')");
		});
		const rows = await driver.select<{ id: string }>(
			"SELECT id FROM t ORDER BY id",
		);
		expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
	});

	it("rolls every write back when the callback throws", async () => {
		const driver = adaptDatabase(fakeSingleConnectionDb());
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
		await expect(
			driver.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id) VALUES ('a')");
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await driver.select("SELECT id FROM t")).toEqual([]);
	});

	it("returns the callback's value", async () => {
		const driver = adaptDatabase(fakeSingleConnectionDb());
		expect(await driver.transaction(async () => 42)).toBe(42);
	});

	it("serializes concurrent transactions instead of nesting BEGIN", async () => {
		// The defect found by the final branch review of plan 4c: an engine pull
		// transaction still open when the UI repository starts its own means the
		// second BEGIN lands inside the first — SQLite rejects it and the user's
		// write fails.
		const driver = adaptDatabase(fakeSingleConnectionDb());
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
		const inside = barrier();
		const resume = barrier();
		const first = driver.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id) VALUES ('a1')");
			inside.open();
			await resume.wait;
			await tx.execute("INSERT INTO t (id) VALUES ('a2')");
		});
		await inside.wait;
		const second = driver.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id) VALUES ('b')");
		});
		resume.open();
		await Promise.all([first, second]);
		const rows = await driver.select<{ id: string }>(
			"SELECT id FROM t ORDER BY id",
		);
		expect(rows.map((r) => r.id)).toEqual(["a1", "a2", "b"]);
	});

	it("keeps a bare write out of a concurrent transaction's rollback", async () => {
		// A statement issued outside any transaction while one is open joins it on
		// the shared connection: rolling that transaction back would silently
		// erase the user's write.
		const driver = adaptDatabase(fakeSingleConnectionDb());
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
		const inside = barrier();
		const resume = barrier();
		const doomed = driver
			.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id) VALUES ('doomed')");
				inside.open();
				await resume.wait;
				throw new Error("boom");
			})
			.catch(() => undefined);
		await inside.wait;
		const bare = driver.execute("INSERT INTO t (id) VALUES ('user-write')");
		resume.open();
		await Promise.all([doomed, bare]);
		const rows = await driver.select<{ id: string }>("SELECT id FROM t");
		expect(rows.map((r) => r.id)).toEqual(["user-write"]);
	});

	it("keeps a bare read from seeing an open transaction's writes", async () => {
		const driver = adaptDatabase(fakeSingleConnectionDb());
		await driver.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
		const inside = barrier();
		const resume = barrier();
		const doomed = driver
			.transaction(async (tx) => {
				await tx.execute("INSERT INTO t (id) VALUES ('doomed')");
				inside.open();
				await resume.wait;
				throw new Error("boom");
			})
			.catch(() => undefined);
		await inside.wait;
		const seen = driver.select<{ id: string }>("SELECT id FROM t");
		resume.open();
		await doomed;
		expect(await seen).toEqual([]);
	});

	it("shares the exclusion between adapters over the same Database", async () => {
		// App.tsx builds one adapter for the sync engine and another inside
		// createRepository: the guarantee must hold across instances, not per
		// instance, or the exact engine-vs-repository interleaving survives.
		const db = fakeSingleConnectionDb();
		const engineDriver = adaptDatabase(db);
		const repositoryDriver = adaptDatabase(db);
		await engineDriver.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
		const inside = barrier();
		const resume = barrier();
		const engineTx = engineDriver.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id) VALUES ('engine')");
			inside.open();
			await resume.wait;
		});
		await inside.wait;
		const repositoryTx = repositoryDriver.transaction(async (tx) => {
			await tx.execute("INSERT INTO t (id) VALUES ('repository')");
		});
		resume.open();
		await Promise.all([engineTx, repositoryTx]);
		const rows = await engineDriver.select<{ id: string }>(
			"SELECT id FROM t ORDER BY id",
		);
		expect(rows.map((r) => r.id)).toEqual(["engine", "repository"]);
	});

	it("rejects a nested transaction instead of deadlocking on the lock", async () => {
		// Nesting was already unsupported (SQLite rejects the inner BEGIN); with
		// the lock it would hang instead, which is far harder to diagnose.
		const driver = adaptDatabase(fakeSingleConnectionDb());
		await expect(
			driver.transaction(async (tx) => {
				await tx.transaction(async () => undefined);
			}),
		).rejects.toThrow(/nested/i);
	});
});
