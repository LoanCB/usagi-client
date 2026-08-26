// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	FAKE_SERVER_INFO,
	makeDevice,
	syncMerging,
	type TestDevice,
} from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";
import { SyncEngine } from "./engine";
import { SyncNetworkError } from "./http";
import { getSyncState, setSyncState } from "./state";
import type { SyncTransport } from "./types";

let server: FakeSyncServer;
let a: TestDevice;
let b: TestDevice;

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
	b = await makeDevice(server);
});
afterEach(() => {
	a?.driver.close();
	b?.driver.close();
});

async function outboxCount(d: TestDevice): Promise<number> {
	const rows = await d.driver.select<{ n: number }>(
		"SELECT COUNT(*) AS n FROM sync_outbox",
	);
	return rows[0].n;
}

describe("pull → merge → apply", () => {
	it("propagates a task from A to B with identical stamps, and both outboxes end empty", async () => {
		const task = await a.repo.createTask({ title: "From A" });
		await syncMerging(a);
		await syncMerging(b);

		const rowsB = await b.driver.select<{
			title: string;
			field_updated_at: string;
		}>("SELECT title, field_updated_at FROM tasks WHERE id = ?", [task.id]);
		expect(rowsB[0].title).toBe("From A");
		const rowsA = await a.driver.select<{ field_updated_at: string }>(
			"SELECT field_updated_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(JSON.parse(rowsB[0].field_updated_at)).toEqual(
			JSON.parse(rowsA[0].field_updated_at),
		);
		expect(await outboxCount(a)).toBe(0);
		expect(await outboxCount(b)).toBe(0);
		expect(await getSyncState(b.driver, "cursor")).toBe(
			String(server.seqCounter),
		);
	});

	it("does not echo a pulled record back to the server (§4.1: no oscillation)", async () => {
		await a.repo.createTask({ title: "quiet" });
		await syncMerging(a);
		const seqAfterA = server.seqCounter;
		await syncMerging(b);
		await syncMerging(b); // a second full cycle must push nothing
		expect(server.seqCounter).toBe(seqAfterA);
	});

	it("merges concurrent edits of different fields of the same task", async () => {
		const task = await a.repo.createTask({ title: "original" });
		await syncMerging(a);
		await syncMerging(b);

		// Offline on both sides: A renames, B reprioritises, 1ms apart so the
		// stamps differ and each field has a distinct winner.
		await a.repo.updateTask(task.id, { title: "renamed by A" });
		await new Promise((r) => setTimeout(r, 2));
		await b.repo.updateTask(task.id, { priority: "high" });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);

		for (const d of [a, b]) {
			const rows = await d.driver.select<{ title: string; priority: string }>(
				"SELECT title, priority FROM tasks WHERE id = ?",
				[task.id],
			);
			expect(rows[0]).toEqual({ title: "renamed by A", priority: "high" });
		}
	});

	it("purge is terminal in both directions (§5.2)", async () => {
		const t1 = await a.repo.createTask({ title: "purged remotely" });
		const t2 = await a.repo.createTask({ title: "purged locally" });
		await syncMerging(a);
		await syncMerging(b);

		// Remote purge vs local edit: A purges t1 while B edits it.
		await a.repo.deleteTask(t1.id);
		await b.repo.updateTask(t1.id, { title: "B edited t1" });
		// Local purge vs remote edit: B purges t2 while A edits it.
		await b.repo.deleteTask(t2.id);
		await a.repo.updateTask(t2.id, { title: "A edited t2" });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);

		for (const d of [a, b]) {
			const rows = await d.driver.select<{
				id: string;
				purged_at: string | null;
			}>("SELECT id, purged_at FROM tasks WHERE id IN (?, ?)", [t1.id, t2.id]);
			expect(rows).toHaveLength(2);
			for (const row of rows) expect(row.purged_at).not.toBeNull();
		}
		expect(server.dump().filter((r) => r.purged)).toHaveLength(2);
	});

	it("creates a local tombstone for a purge of a never-seen record", async () => {
		const task = await a.repo.createTask({ title: "born and purged on A" });
		await a.repo.deleteTask(task.id);
		await syncMerging(a);
		await syncMerging(b);
		const rows = await b.driver.select<{ purged_at: string | null }>(
			"SELECT purged_at FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].purged_at).not.toBeNull();
		expect(await outboxCount(b)).toBe(0);
	});

	it("quarantines an undecryptable blob, keeps the loop running, and retries later (§7)", async () => {
		const bad = await a.repo.createTask({ title: "will corrupt" });
		const good = await a.repo.createTask({ title: "fine" });
		await syncMerging(a);

		b.cipher.corrupt("task", bad.id);
		await syncMerging(b);

		const tasksB = await b.driver.select<{ id: string }>(
			"SELECT id FROM tasks",
		);
		expect(tasksB.map((r) => r.id)).toEqual([good.id]);
		const quarantine = await b.driver.select<{
			entity_id: string;
			reason: string;
		}>("SELECT entity_id, reason FROM sync_quarantine");
		expect(quarantine).toEqual([
			{ entity_id: bad.id, reason: "decrypt-failed" },
		]);
		// The cursor moved past the poisoned record: the loop was not blocked.
		expect(await getSyncState(b.driver, "cursor")).toBe(
			String(server.seqCounter),
		);

		// The blob heals (e.g. vault unlocked with the right key): retried and applied.
		b.cipher.heal("task", bad.id);
		await syncMerging(b);
		expect(
			await b.driver.select("SELECT id FROM tasks WHERE id = ?", [bad.id]),
		).toHaveLength(1);
		expect(await b.driver.select("SELECT * FROM sync_quarantine")).toHaveLength(
			0,
		);
	});

	it("survives quarantine across a restart (persisted, not in memory)", async () => {
		const bad = await a.repo.createTask({ title: "poison" });
		await syncMerging(a);
		b.cipher.corrupt("task", bad.id);
		await syncMerging(b);
		const reopened = b.driver.reopen();
		const rows = await reopened.select<{ entity_id: string }>(
			"SELECT entity_id FROM sync_quarantine",
		);
		expect(rows).toEqual([{ entity_id: bad.id }]);
		reopened.close();
	});

	it("resets the cursor and re-pulls everything on 409 CURSOR_OUT_OF_RANGE", async () => {
		const task = await a.repo.createTask({ title: "resync me" });
		await syncMerging(a);
		await syncMerging(b);
		// A cursor from another life (spec: restored backup, another server).
		await setSyncState(b.driver, "cursor", String(server.seqCounter + 100));
		await b.repo.updateTask(task.id, { title: "edited on B" });
		await syncMerging(b);
		expect(await getSyncState(b.driver, "cursor")).toBe(
			String(server.seqCounter),
		);
		expect(await outboxCount(b)).toBe(0);
		const rows = await b.driver.select<{ title: string }>(
			"SELECT title FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].title).toBe("edited on B");
	});

	it("applies a page, clears the outbox and advances the cursor in ONE transaction (§9.5)", async () => {
		await a.repo.createTask({ title: "atomic" });
		await syncMerging(a);
		const cursorBefore = await getSyncState(b.driver, "cursor");
		// The outbox cleanup is the last write of the page transaction: making
		// it fail must roll back the applied row AND the cursor with it.
		b.driver.failNextExecuteMatching(/DELETE FROM sync_outbox/);
		await expect(b.engine.syncNow()).rejects.toThrow();
		expect(await b.driver.select("SELECT id FROM tasks")).toHaveLength(0);
		expect(await getSyncState(b.driver, "cursor")).toBe(cursorBefore);
		// Next attempt succeeds and converges — the replay is idempotent.
		await syncMerging(b);
		expect(await b.driver.select("SELECT id FROM tasks")).toHaveLength(1);
	});

	it("does not fast-forward the cursor over a foreign push racing ours (§3.2)", async () => {
		const task = await a.repo.createTask({ title: "mine" });
		await syncMerging(a);
		await a.repo.updateTask(task.id, { title: "mine v2" });

		// The §3.2 interleave: another device's push lands between our pull
		// phase and our push, so its seq sits in the gap between our cursor and
		// our own applied seqs. Fast-forwarding over that gap would skip the
		// foreign record forever (until it happens to change again).
		const base = server.transport();
		let raced = false;
		const racing: SyncTransport = {
			pull: (cursor, limit) => base.pull(cursor, limit),
			push: async (changes) => {
				if (!raced) {
					raced = true;
					const foreign = {
						_v: 1,
						created_at: "2026-08-25T08:00:00.000Z",
						_fields: {
							title: { t: "2026-08-25T09:00:00.000Z", d: "other-device" },
						},
						title: "foreign task",
						description: null,
						project_id: null,
						priority: "none",
						due_date: null,
						sort_key: "a1",
						completed_at: null,
						deleted_at: null,
						tags: [],
					};
					const enc = await a.cipher.encrypt(
						"task",
						"foreign-1",
						JSON.stringify(foreign),
					);
					server.push([
						{ entityType: "task", id: "foreign-1", purged: false, ...enc },
					]);
				}
				return base.push(changes);
			},
		};
		const rigged = new SyncEngine({
			db: a.driver,
			transport: racing,
			cipher: a.cipher,
			getServerInfo: async () => FAKE_SERVER_INFO,
		});
		await rigged.syncNow();

		// The next ordinary sync must still serve the foreign record.
		await syncMerging(a);
		const rows = await a.driver.select<{ title: string }>(
			"SELECT title FROM tasks WHERE id = 'foreign-1'",
		);
		expect(rows).toHaveLength(1);
		expect(await getSyncState(a.driver, "cursor")).toBe(
			String(server.seqCounter),
		);
	});

	it("repairs an orphaned task into the Inbox at end of cycle (§5.3), and it propagates", async () => {
		const project = await a.repo.createProject({ name: "Doomed" });
		const task = await a.repo.createTask({
			title: "orphan",
			projectId: project.id,
		});
		await syncMerging(a);
		await syncMerging(b);
		// A genuine purge only exists as a tombstone: deleteProject merely
		// archives (deleted_at, restorable §1.3), which must NOT orphan anything.
		server.push([{ entityType: "project", id: project.id, purged: true }]);
		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);
		for (const d of [a, b]) {
			const rows = await d.driver.select<{ project_id: string | null }>(
				"SELECT project_id FROM tasks WHERE id = ?",
				[task.id],
			);
			expect(rows[0].project_id).toBeNull();
		}
	});

	it("keeps a task's project when the project is merely archived (§1.3: restorable)", async () => {
		const project = await a.repo.createProject({ name: "Paused" });
		const task = await a.repo.createTask({
			title: "kept",
			projectId: project.id,
		});
		await syncMerging(a);
		await a.repo.deleteProject(project.id); // archive, not purge
		await syncMerging(a);
		await syncMerging(a); // a second full cycle: the repair had every chance to fire
		const rows = await a.driver.select<{ project_id: string | null }>(
			"SELECT project_id FROM tasks WHERE id = ?",
			[task.id],
		);
		expect(rows[0].project_id).toBe(project.id);
	});

	it("converges two same-named tags created offline to one, preserving assignments", async () => {
		// First contact while B is still empty: the §6.4 gate stays down, and
		// resolveFirstSync (a stub until the first-sync task) is never needed.
		await syncMerging(b);
		const taskA = await a.repo.createTask({ title: "on A" });
		const taskB = await b.repo.createTask({ title: "on B" });
		const tagA = await a.repo.createTag({ name: "urgent" });
		const tagB = await b.repo.createTag({ name: "urgent" });
		await a.repo.updateTask(taskA.id, { tagIds: [tagA.id] });
		await b.repo.updateTask(taskB.id, { tagIds: [tagB.id] });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);
		await syncMerging(b);

		const winner = tagA.id < tagB.id ? tagA.id : tagB.id;
		for (const d of [a, b]) {
			const live = await d.driver.select<{ id: string }>(
				"SELECT id FROM tags WHERE purged_at IS NULL",
			);
			expect(live.map((r) => r.id)).toEqual([winner]);
			const links = await d.driver.select<{ task_id: string; tag_id: string }>(
				"SELECT task_id, tag_id FROM task_tags ORDER BY task_id",
			);
			expect(links.map((l) => l.tag_id)).toEqual([winner, winner]);
			expect(new Set(links.map((l) => l.task_id))).toEqual(
				new Set([taskA.id, taskB.id]),
			);
		}
	});

	it("resolves a tag-name collision on the MERGED name, not a stale pushed name (rename-and-reuse)", async () => {
		// dirtied_at is stamped by a SQL trigger (strftime('now'), real wall
		// clock — not the JS clock, so vi.useFakeTimers cannot control it): a
		// small real sleep is needed between the rename and the create so they
		// land in different milliseconds and push/pull in the intended order
		// (same-millisecond dirtying is a separate, pre-existing ordering
		// hazard this test does not exist to cover — see the other same-file
		// precedent at "merges concurrent edits of different fields").
		const tick = () => new Promise((r) => setTimeout(r, 2));

		// Both devices know tag X = "bar".
		const tagX = await a.repo.createTag({ name: "bar" });
		await syncMerging(a);
		await syncMerging(b);

		// A renames X -> "foo" and creates Y = "bar", then syncs.
		await a.repo.updateTag(tagX.id, { name: "foo" });
		await tick();
		const tagY = await a.repo.createTag({ name: "bar" });
		await syncMerging(a);

		// B, still offline at that point, edits only X's color (not its name):
		// B's push carries X with its OLD (stale) name "bar".
		await b.repo.updateTag(tagX.id, { color: "#ff0000" });
		await syncMerging(b);

		// A pulls B's push: the incoming payload's name is stale ("bar"), but
		// the merged name must resolve to "foo" (A's rename has the newer
		// stamp) — a resolver running on the raw incoming name would wrongly
		// see a collision with Y and purge a live tag.
		await syncMerging(a);
		await syncMerging(b);

		for (const d of [a, b]) {
			const rows = await d.driver.select<{
				id: string;
				name: string;
				color: string | null;
				purged_at: string | null;
			}>("SELECT id, name, color, purged_at FROM tags ORDER BY id");
			const live = rows.filter((r) => r.purged_at === null);
			expect(live).toHaveLength(2);
			const x = live.find((r) => r.id === tagX.id);
			const y = live.find((r) => r.id === tagY.id);
			expect(x).toBeDefined();
			expect(y).toBeDefined();
			expect(x?.name).toBe("foo");
			expect(x?.color).toBe("#ff0000");
			expect(y?.name).toBe("bar");
			expect(rows.every((r) => r.purged_at === null)).toBe(true);
		}
	});

	it("resolves a merged-rename collision deterministically, tombstoning the loser and remapping its links", async () => {
		const tick = () => new Promise((r) => setTimeout(r, 2));

		// Both devices start out knowing only tag X = "x" (tags.name is
		// locally UNIQUE, so A renaming X into a name it already has taken
		// locally is not a sync scenario at all — the collision has to
		// arrive from a rival created concurrently on the OTHER device,
		// unseen by A until it pulls).
		const tagX = await a.repo.createTag({ name: "x" });
		await syncMerging(a);
		await syncMerging(b);

		const task = await b.repo.createTask({ title: "tagged" });
		await b.repo.updateTask(task.id, { tagIds: [tagX.id] });
		await syncMerging(b);
		await syncMerging(a);

		// Offline on both sides: A renames X -> "bar"; B independently
		// creates Y = "bar". Neither device can see the other's write yet,
		// so neither hits the local UNIQUE constraint.
		await a.repo.updateTag(tagX.id, { name: "bar" });
		await tick();
		const tagY = await b.repo.createTag({ name: "bar" });

		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);

		const winner = tagX.id < tagY.id ? tagX.id : tagY.id;
		const loser = tagX.id < tagY.id ? tagY.id : tagX.id;
		for (const d of [a, b]) {
			const rows = await d.driver.select<{
				id: string;
				name: string;
				purged_at: string | null;
			}>("SELECT id, name, purged_at FROM tags WHERE id IN (?, ?)", [
				tagX.id,
				tagY.id,
			]);
			const live = rows.filter((r) => r.purged_at === null);
			const purged = rows.filter((r) => r.purged_at !== null);
			expect(live.map((r) => r.id)).toEqual([winner]);
			expect(live[0].name).toBe("bar");
			expect(purged.map((r) => r.id)).toEqual([loser]);

			const links = await d.driver.select<{
				task_id: string;
				tag_id: string;
			}>("SELECT task_id, tag_id FROM task_tags WHERE task_id = ?", [task.id]);
			// The link must have followed to the surviving tag, whichever it is.
			expect(links.map((l) => l.tag_id)).toEqual([winner]);
		}
	});

	it("preserves unknown payload fields end to end (§5.4)", async () => {
		// A future client pushed a task carrying a field this version ignores.
		const futurePayload = {
			_v: 1,
			created_at: "2026-08-20T08:00:00.000Z",
			_fields: {
				title: { t: "2026-08-25T09:00:00.000Z", d: "future-device" },
				recurrence: { t: "2026-08-25T09:00:00.000Z", d: "future-device" },
			},
			title: "recurring task",
			description: null,
			project_id: null,
			priority: "none",
			due_date: null,
			sort_key: "a0",
			completed_at: null,
			deleted_at: null,
			tags: [],
			recurrence: { every: "week" },
		};
		const enc = await b.cipher.encrypt(
			"task",
			"future-1",
			JSON.stringify(futurePayload),
		);
		server.push([
			{ entityType: "task", id: "future-1", purged: false, ...enc },
		]);

		await syncMerging(b);
		await b.repo.updateTask("future-1", { title: "renamed by old client" });
		await syncMerging(b);

		const stored = server.dump().find((r) => r.id === "future-1");
		const decrypted = JSON.parse(
			await b.cipher.decrypt(
				"task",
				"future-1",
				stored?.ciphertext ?? "",
				stored?.nonce ?? "",
			),
		) as Record<string, unknown>;
		expect(decrypted.title).toBe("renamed by old client");
		expect(decrypted.recurrence).toEqual({ every: "week" });
	});

	it("absorbs serverTime into the persisted clock offset (§5.1)", async () => {
		await a.repo.createTask({ title: "tick" });
		await syncMerging(a);
		const stored = await getSyncState(a.driver, "clock_offset_ms");
		expect(stored).not.toBeNull();
		expect(Math.abs(Number(stored))).toBeLessThan(5_000); // fake server = same machine clock
	});

	it("treats SyncNetworkError as offline (§7): syncNow resolves quietly and status returns to idle", async () => {
		// Simulates Tauri's plugin-http, which rejects with a non-TypeError.
		const offlineTransport: SyncTransport = {
			pull: () => Promise.reject(new SyncNetworkError("could not connect")),
			push: () => Promise.reject(new SyncNetworkError("could not connect")),
		};
		const offline = new SyncEngine({
			db: a.driver,
			transport: offlineTransport,
			cipher: a.cipher,
			getServerInfo: async () => FAKE_SERVER_INFO,
		});
		await expect(offline.syncNow()).resolves.toBeUndefined();
		expect(offline.getStatus()).toBe("idle");
	});

	it("surfaces a programming bug instead of mistaking its TypeError for being offline", async () => {
		// Every real transport failure is wrapped into SyncNetworkError by
		// requestJson, so a raw TypeError reaching syncNow is never "offline":
		// it is a bug (here the classic call on an undefined value). Swallowing
		// it would leave sync silently dead — status idle, nothing pushed, no
		// error anywhere.
		const buggy = {
			pull: () => {
				const missing = undefined as unknown as { fn: () => void };
				missing.fn();
				return Promise.reject(new Error("unreachable"));
			},
			push: () => Promise.reject(new Error("unreachable")),
		} as unknown as SyncTransport;
		const engine = new SyncEngine({
			db: a.driver,
			transport: buggy,
			cipher: a.cipher,
			getServerInfo: async () => FAKE_SERVER_INFO,
		});
		await expect(engine.syncNow()).rejects.toThrow(TypeError);
	});
});
