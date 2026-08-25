// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	makeDevice,
	syncMerging,
	type TestDevice,
} from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";
import { getSyncState } from "./state";

let server: FakeSyncServer;
let a: TestDevice;
let b: TestDevice;

beforeEach(async () => {
	server = new FakeSyncServer();
	a = await makeDevice(server);
	b = await makeDevice(server);
	// A seeds the account; B is the second device arriving with its own data.
	await a.repo.createTask({ title: "from the account" });
	await syncMerging(a);
	await b.repo.createTask({ title: "local on B" });
});
afterEach(() => {
	a?.driver.close();
	b?.driver.close();
});

describe("first sync (§6.4)", () => {
	it("gates when local and remote are both non-empty: nothing applied, nothing pushed", async () => {
		const seqBefore = server.seqCounter;
		await b.engine.syncNow();
		expect(b.engine.getStatus()).toBe("awaiting-first-sync");
		expect(server.seqCounter).toBe(seqBefore);
		const titles = await b.driver.select<{ title: string }>(
			"SELECT title FROM tasks",
		);
		expect(titles).toEqual([{ title: "local on B" }]);
		expect(await getSyncState(b.driver, "cursor")).toBeNull();
	});

	it("merge: both datasets survive, reconciled by normal LWW", async () => {
		await b.engine.syncNow();
		await b.engine.resolveFirstSync("merge");
		await syncMerging(a);
		for (const d of [a, b]) {
			const titles = await d.driver.select<{ title: string }>(
				"SELECT title FROM tasks ORDER BY title",
			);
			expect(titles.map((t) => t.title)).toEqual([
				"from the account",
				"local on B",
			]);
		}
	});

	it("replace: local data is wiped, never pushed, and the account is re-downloaded", async () => {
		await b.engine.syncNow();
		const seqBefore = server.seqCounter;
		await b.engine.resolveFirstSync("replace");
		// Nothing of B's abandoned data ever reached the server (§6.4: the
		// outbox is emptied before the first push).
		expect(server.seqCounter).toBe(seqBefore);
		const titles = await b.driver.select<{ title: string }>(
			"SELECT title FROM tasks",
		);
		expect(titles).toEqual([{ title: "from the account" }]);
		const outbox = await b.driver.select("SELECT * FROM sync_outbox");
		expect(outbox).toHaveLength(0);
	});

	it("asks only once: after resolution the gate never rises again", async () => {
		await b.engine.syncNow();
		await b.engine.resolveFirstSync("merge");
		await b.repo.createTask({ title: "later" });
		await b.engine.syncNow();
		expect(b.engine.getStatus()).toBe("idle");
	});

	it("does not gate a fresh empty device", async () => {
		const c = await makeDevice(server);
		await c.engine.syncNow();
		expect(c.engine.getStatus()).toBe("idle");
		expect(await c.driver.select("SELECT id FROM tasks")).toHaveLength(1);
		c.driver.close();
	});

	it("does not gate against an empty account", async () => {
		const emptyServer = new FakeSyncServer();
		const d = await makeDevice(emptyServer);
		await d.repo.createTask({ title: "purely local until now" });
		await d.engine.syncNow();
		expect(d.engine.getStatus()).toBe("idle");
		expect(emptyServer.dump()).toHaveLength(1);
		d.driver.close();
	});
});
