// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	makeDevice,
	syncMerging,
	type TestDevice,
} from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";
import { signOut } from "./auth";
import type { FetchLike } from "./http";

let server: FakeSyncServer;
let a: TestDevice;
let b: TestDevice;

const live = (d: TestDevice) =>
	d.driver
		.select<{ title: string }>(
			"SELECT title FROM tasks WHERE purged_at IS NULL ORDER BY title",
		)
		.then((rows) => rows.map((r) => r.title));

/** The real sign-out's local effects (the server call is stubbed). */
async function signOutLocally(d: TestDevice) {
	await signOut({
		db: d.driver,
		fetchImpl: (async () => new Response(null, { status: 204 })) as FetchLike,
		baseUrl: "https://sync.test",
	});
}

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
	b = await makeDevice(server);
});
afterEach(() => {
	a?.driver.close();
	b?.driver.close();
});

describe("merge after a sign-out / sign-in", () => {
	it("H1: local rows written before a sign-out are pushed by the next merge", async () => {
		await b.repo.createTask({ title: "b1" });
		await signOutLocally(b); // B had been connected, then signed out
		await a.repo.createTask({ title: "a1" });
		await syncMerging(a);
		await syncMerging(b);
		await syncMerging(a);
		expect(await live(a)).toEqual(["a1", "b1"]);
		expect(await live(b)).toEqual(["a1", "b1"]);
	});

	it("H2: a deletion B once received does not wipe the account's live copy on a later merge", async () => {
		// A and B share t; A deletes it; B receives the tombstone.
		await a.repo.createTask({ title: "t" });
		await syncMerging(a);
		await syncMerging(b);
		const [row] = await a.driver.select<{ id: string }>("SELECT id FROM tasks");
		await a.repo.deleteTask(row.id);
		await syncMerging(a);
		await syncMerging(b);
		// B signs out. Later the account gets that same id live again (another
		// device's "keep only this device" pushed it back).
		await signOutLocally(b);
		const c = await makeDevice(server);
		await c.repo.createTask({ title: "c1" });
		await syncMerging(c);
		await syncMerging(b);
		await syncMerging(c);
		expect(await live(c)).toContain("c1");
		c.driver.close();
	});

	it("H2b: a stale tombstone from a past session does not delete what another device re-asserted", async () => {
		// A, B and C share t.
		const c = await makeDevice(server);
		await a.repo.createTask({ title: "t" });
		for (const d of [a, b, c]) await syncMerging(d);
		// C signs out, still holding t live.
		await signOutLocally(c);
		// A deletes t; B receives the deletion (t is a tombstone row on B).
		const [row] = await a.driver.select<{ id: string }>("SELECT id FROM tasks");
		await a.repo.deleteTask(row.id);
		await syncMerging(a);
		await syncMerging(b);
		// B signs out. C signs back in and keeps only its own data: t is live again.
		await signOutLocally(b);
		await c.engine.syncNow();
		await c.engine.resolveFirstSync("local");
		// B signs back in and merges.
		await b.repo.createTask({ title: "b-new" });
		await b.engine.syncNow();
		if (b.engine.getStatus() === "awaiting-first-sync") {
			await b.engine.resolveFirstSync("merge");
		}
		await c.engine.syncNow();
		expect(await live(c)).toEqual(["b-new", "t"]);
		expect(await live(b)).toEqual(["b-new", "t"]);
		c.driver.close();
	});

	it("signs out even when a live row still points at a purged project", async () => {
		const project = await b.repo.createProject({ name: "gone" });
		await b.repo.createTask({ title: "orphan-to-be", projectId: project.id });
		await b.driver.execute(
			"UPDATE projects SET purged_at = '2026-01-01T00:00:00.000Z' WHERE id = ?",
			[project.id],
		);
		await signOutLocally(b);
		const kept = await b.driver.select("SELECT id FROM projects WHERE id = ?", [
			project.id,
		]);
		expect(kept).toHaveLength(1);
		expect(await live(b)).toEqual(["orphan-to-be"]);
	});
});
