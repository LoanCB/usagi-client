import { describe, expect, it } from "vitest";
import { CursorOutOfRangeError, type PushChange } from "@/sync/types";
import { FakeSyncServer } from "./FakeSyncServer";

function alive(id: string, over: Partial<PushChange> = {}): PushChange {
	return {
		entityType: "task",
		id,
		purged: false,
		ciphertext: "Y2lwaGVy",
		nonce: "bm9uY2Vub25jZW5vbmNlbm9uY2Vub25jZQ==",
		...over,
	};
}

describe("FakeSyncServer (mirrors the verified server semantics)", () => {
	it("assigns dense sequential seqs and returns serverTime", () => {
		const server = new FakeSyncServer();
		const res = server.push([
			alive("a"),
			alive("b", { entityType: "project" }),
		]);
		expect(res.applied.map((x) => x.seq)).toEqual([1, 2]);
		expect(new Date(res.serverTime).toISOString()).toBe(res.serverTime);
	});

	it("overwrites unconditionally and advances seq on re-push", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		server.push([alive("a", { ciphertext: "ZnJlc2g=" })]);
		expect(server.dump()).toHaveLength(1);
		expect(server.dump()[0].seq).toBe(2);
		expect(server.dump()[0].ciphertext).toBe("ZnJlc2g=");
	});

	it("stores a tombstone with no payload, accepting null or omitted fields", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		server.push([{ entityType: "task", id: "a", purged: true }]);
		expect(server.dump()[0]).toMatchObject({
			purged: true,
			ciphertext: null,
			nonce: null,
		});
	});

	it("rejects a tombstone that carries a payload (records_tombstone_shape)", () => {
		const server = new FakeSyncServer();
		expect(() => server.push([alive("a", { purged: true })])).toThrow(
			/tombstone/,
		);
	});

	it("rejects an empty batch and a batch above 100", () => {
		const server = new FakeSyncServer();
		expect(() => server.push([])).toThrow(/batch/);
		expect(() =>
			server.push(Array.from({ length: 101 }, (_, i) => alive(`t${i}`))),
		).toThrow(/batch/);
	});

	it("paginates with an exclusive cursor and hasMore", () => {
		const server = new FakeSyncServer();
		server.push(Array.from({ length: 5 }, (_, i) => alive(`t${i}`)));
		const p1 = server.pull(0, 2);
		expect(p1.records.map((r) => r.seq)).toEqual([1, 2]);
		expect(p1.nextCursor).toBe(2);
		expect(p1.hasMore).toBe(true);
		const p3 = server.pull(4, 2);
		expect(p3.records.map((r) => r.seq)).toEqual([5]);
		expect(p3.hasMore).toBe(false);
	});

	it("answers empty at the latest cursor without moving it", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		const res = server.pull(1, 500);
		expect(res.records).toEqual([]);
		expect(res.nextCursor).toBe(1);
	});

	it("throws CursorOutOfRangeError past the counter", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		expect(() => server.pull(2, 500)).toThrow(CursorOutOfRangeError);
	});

	it("re-serves the freshest state of an entity pushed then purged", () => {
		const server = new FakeSyncServer();
		server.push([alive("a")]);
		server.push([{ entityType: "task", id: "a", purged: true }]);
		const res = server.pull(0, 500);
		expect(res.records).toHaveLength(1);
		expect(res.records[0]).toMatchObject({ id: "a", seq: 2, purged: true });
	});

	it("reports hasMore false when the remaining records exactly fill the limit", () => {
		const server = new FakeSyncServer();
		server.push(Array.from({ length: 4 }, (_, i) => alive(`t${i}`)));
		const page = server.pull(2, 2);
		expect(page.records.map((r) => r.seq)).toEqual([3, 4]);
		expect(page.hasMore).toBe(false);
		expect(page.nextCursor).toBe(4);
	});

	it("exposes a transport that delegates and counts every request", async () => {
		const server = new FakeSyncServer();
		const transport = server.transport();
		const pushed = await transport.push([alive("a")]);
		expect(pushed.applied.map((x) => x.seq)).toEqual([1]);
		const pulled = await transport.pull(0, 500);
		expect(pulled.records.map((r) => r.seq)).toEqual([1]);
		expect(server.requestCount).toBe(2);
		await transport.pull(1, 500);
		expect(server.requestCount).toBe(3);
	});

	it("copies the changes handed to the transport so later mutation is inert", async () => {
		const server = new FakeSyncServer();
		const change = alive("a");
		await server.transport().push([change]);
		change.ciphertext = "dGFtcGVyZWQ=";
		change.purged = true;
		expect(server.dump()[0]).toMatchObject({
			purged: false,
			ciphertext: "Y2lwaGVy",
		});
	});
});
