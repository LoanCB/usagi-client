import { describe, expect, it, vi } from "vitest";
import type { AuthorizedHttp } from "./auth";
import { RequestGate } from "./backoff";
import { SyncHttpError } from "./http";
import { HttpSyncTransport } from "./transport";
import { CursorOutOfRangeError, type PullResponse } from "./types";

const PULL_OK: PullResponse = {
	records: [],
	nextCursor: 3,
	hasMore: false,
	serverTime: "2026-08-25T10:00:00.000Z",
};

function instantGate(sleeps: number[] = []) {
	let now = 0;
	return new RequestGate({
		now: () => now,
		sleep: async (ms) => {
			sleeps.push(ms);
			now += ms;
		},
	});
}

function httpStub(
	fn: (method: string, path: string, body?: unknown) => Promise<unknown>,
) {
	return { request: vi.fn(fn) } as unknown as AuthorizedHttp & {
		request: ReturnType<typeof vi.fn>;
	};
}

describe("HttpSyncTransport", () => {
	it("pulls through GET /v1/sync/pull with cursor and limit", async () => {
		const http = httpStub(async () => PULL_OK);
		const transport = new HttpSyncTransport(http, instantGate());
		const res = await transport.pull(7, 500);
		expect(res).toEqual(PULL_OK);
		expect(http.request).toHaveBeenCalledWith(
			"GET",
			"/v1/sync/pull?cursor=7&limit=500",
		);
	});

	it("pushes through POST /v1/sync/push", async () => {
		const http = httpStub(async () => ({
			applied: [],
			serverTime: "2026-08-25T10:00:00.000Z",
		}));
		const transport = new HttpSyncTransport(http, instantGate());
		const changes = [{ entityType: "task" as const, id: "t1", purged: true }];
		await transport.push(changes);
		expect(http.request).toHaveBeenCalledWith("POST", "/v1/sync/push", {
			changes,
		});
	});

	it("retries after 429 with backoff and eventually succeeds", async () => {
		const sleeps: number[] = [];
		let calls = 0;
		const http = httpStub(async () => {
			calls++;
			if (calls <= 2) throw new SyncHttpError(429, null, null, "throttled");
			return PULL_OK;
		});
		const transport = new HttpSyncTransport(http, instantGate(sleeps));
		const res = await transport.pull(0, 500);
		expect(res.nextCursor).toBe(3);
		expect(calls).toBe(3);
		expect(sleeps).toEqual([5_000, 10_000]); // exponential ladder, then success resets it
	});

	it("honors Retry-After over the ladder", async () => {
		const sleeps: number[] = [];
		let calls = 0;
		const http = httpStub(async () => {
			calls++;
			if (calls === 1) throw new SyncHttpError(429, null, 12_000, "throttled");
			return PULL_OK;
		});
		const transport = new HttpSyncTransport(http, instantGate(sleeps));
		await transport.pull(0, 500);
		expect(sleeps).toEqual([12_000]);
	});

	it("maps 409 CURSOR_OUT_OF_RANGE to its typed error", async () => {
		const http = httpStub(async () => {
			throw new SyncHttpError(
				409,
				"CURSOR_OUT_OF_RANGE",
				null,
				"cursor is beyond",
			);
		});
		const transport = new HttpSyncTransport(http, instantGate());
		await expect(transport.pull(99, 500)).rejects.toThrow(
			CursorOutOfRangeError,
		);
	});

	it("lets any other error escape untouched (offline, 500, reauth)", async () => {
		const boom = new SyncHttpError(500, null, null, "server exploded");
		const http = httpStub(async () => {
			throw boom;
		});
		const transport = new HttpSyncTransport(http, instantGate());
		await expect(transport.pull(0, 500)).rejects.toBe(boom);
	});
});
