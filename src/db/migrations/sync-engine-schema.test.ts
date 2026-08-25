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

describe("migration 012 (sync engine schema)", () => {
	it.each([
		"tasks",
		"projects",
		"tags",
		"project_groups",
	])("adds sync_extra to %s", async (table) => {
		const cols = await driver.select<{ name: string }>(
			`PRAGMA table_info(${table})`,
		);
		expect(cols.map((c) => c.name)).toContain("sync_extra");
	});

	it("creates sync_quarantine keyed by entity", async () => {
		await driver.execute(
			`INSERT INTO sync_quarantine
			 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
			 VALUES ('task', 't1', 42, 'pull', 'YWJj', 'bm9uY2U=', 'decrypt-failed', '2026-08-25T10:00:00.000Z')`,
		);
		// Same entity again: the fresher failure replaces the stale one.
		await driver.execute(
			`INSERT OR REPLACE INTO sync_quarantine
			 (entity_type, entity_id, seq, direction, ciphertext, nonce, reason, quarantined_at)
			 VALUES ('task', 't1', 43, 'pull', 'ZGVm', 'bm9uY2U=', 'decrypt-failed', '2026-08-25T11:00:00.000Z')`,
		);
		const rows = await driver.select<{ seq: number; reason: string }>(
			"SELECT seq, reason FROM sync_quarantine",
		);
		expect(rows).toEqual([{ seq: 43, reason: "decrypt-failed" }]);
	});

	it("rejects a direction outside pull/push", async () => {
		await expect(
			driver.execute(
				`INSERT INTO sync_quarantine
				 (entity_type, entity_id, direction, reason, quarantined_at)
				 VALUES ('task', 't2', 'sideways', 'x', '2026-08-25T10:00:00.000Z')`,
			),
		).rejects.toThrow(/CHECK/);
	});

	it("does not drop the outbox triggers (rebuild trap, spec §9.6)", async () => {
		const triggers = await driver.select<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_%_outbox_%'",
		);
		expect(triggers.length).toBe(12);
	});
});
