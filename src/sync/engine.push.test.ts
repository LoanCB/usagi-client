// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PushChange, PushResponse } from "@/sync/types";
import {
	makeDevice,
	syncMerging,
	type TestDevice,
} from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";

let server: FakeSyncServer;
let a: TestDevice;

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
});
afterEach(() => a?.driver.close());

async function outboxCount(d: TestDevice): Promise<number> {
	const rows = await d.driver.select<{ n: number }>(
		"SELECT COUNT(*) AS n FROM sync_outbox",
	);
	return rows[0].n;
}

describe("push phase", () => {
	it("drains a large outbox in batches of at most 100", async () => {
		for (let i = 0; i < 230; i++) {
			await a.repo.createTask({ title: `task ${i}` });
		}
		const pullsBefore = server.requestCount;
		await syncMerging(a);
		expect(server.dump().filter((r) => r.entityType === "task")).toHaveLength(
			230,
		);
		expect(await outboxCount(a)).toBe(0);
		// 230 changes at ≤100 per batch = at least 3 pushes (plus the pulls).
		expect(server.requestCount - pullsBefore).toBeGreaterThanOrEqual(4);
	});

	it("pushes a purge as a bare tombstone the server-side CHECK accepts", async () => {
		const task = await a.repo.createTask({ title: "doomed" });
		await syncMerging(a);
		await a.repo.deleteTask(task.id);
		// FakeSyncServer throws on a payload-carrying tombstone, mirroring the
		// server's records_tombstone_shape — reaching the assertions below
		// proves the wire shape is right.
		await syncMerging(a);
		const stored = server.dump().find((r) => r.id === task.id);
		expect(stored).toMatchObject({
			purged: true,
			ciphertext: null,
			nonce: null,
		});
		expect(await outboxCount(a)).toBe(0);
	});

	it("re-pushes the fresh state when a local write lands during the push", async () => {
		const task = await a.repo.createTask({ title: "v1" });
		// The outbox trigger stamps dirtied_at at millisecond resolution: a
		// mid-push write landing in the SAME millisecond as createTask would
		// collide with the captured value and slip past the settlement guard.
		// Backdate the pending entry so the mid-push stamp is provably fresher.
		await a.driver.execute(
			"UPDATE sync_outbox SET dirtied_at = '2020-01-01T00:00:00.000Z' WHERE entity_id = ?",
			[task.id],
		);
		// A write arrives while the push request is in flight: the outbox entry
		// is replaced under the engine's feet with a fresher dirtied_at.
		const originalPush = server.push.bind(server);
		let interfered = false;
		server.push = (changes: PushChange[]): PushResponse => {
			const out = originalPush(changes);
			if (
				!interfered &&
				changes.length > 0 &&
				changes[0].id === task.id &&
				!changes[0].purged
			) {
				interfered = true;
				// Direct driver write: better-sqlite3 executes synchronously
				// beneath its promise wrapper, so the row AND its outbox entry
				// (via the UPDATE trigger) are fresher before push() even
				// returns — deterministic, no microtask race.
				a.driver.execute(
					"UPDATE tasks SET title = 'v2 — mid-push', updated_at = '2026-12-31T00:00:00.000Z' WHERE id = ?",
					[task.id],
				);
			}
			return out;
		};
		await syncMerging(a);
		const stored = server.dump().find((r) => r.id === task.id);
		const decrypted = JSON.parse(
			await a.cipher.decrypt(
				"task",
				task.id,
				stored?.ciphertext ?? "",
				stored?.nonce ?? "",
			),
		) as { title: string };
		expect(decrypted.title).toBe("v2 — mid-push");
		expect(await outboxCount(a)).toBe(0);
	});

	it("quarantines an oversized record instead of wedging the whole outbox", async () => {
		const huge = await a.repo.createTask({ title: "huge" });
		await a.repo.updateTask(huge.id, { description: "x".repeat(70_000) });
		const fine = await a.repo.createTask({ title: "fine" });
		await syncMerging(a);
		// The valid record went through; the oversized one is parked, visibly.
		expect(server.dump().map((r) => r.id)).toContain(fine.id);
		expect(server.dump().map((r) => r.id)).not.toContain(huge.id);
		const parked = await a.driver.select<{
			entity_id: string;
			direction: string;
			reason: string;
		}>("SELECT entity_id, direction, reason FROM sync_quarantine");
		expect(parked).toEqual([
			{ entity_id: huge.id, direction: "push", reason: "payload-too-large" },
		]);
		expect(await outboxCount(a)).toBe(0);
	});

	it("drops an outbox entry pointing at a physically-deleted row (pre-4a ghost)", async () => {
		await a.driver.execute(
			"INSERT INTO sync_outbox (entity_type, entity_id, dirtied_at) VALUES ('task', 'ghost-1', '2026-01-01T00:00:00.000Z')",
		);
		await syncMerging(a);
		expect(await outboxCount(a)).toBe(0);
		expect(server.dump()).toHaveLength(0);
	});
});
