import { describe, expect, it, vi } from "vitest";
import { requestJson, SyncHttpError, SyncNetworkError } from "./http";

function jsonResponse(
	status: number,
	body: unknown,
	headers?: Record<string, string>,
) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("requestJson", () => {
	it("sends JSON with the bearer token and parses the response", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: 1 }));
		const out = await requestJson<{ ok: number }>(
			fetchSpy,
			"POST",
			"https://sync.example/v1/sync/push",
			{ body: { changes: [] }, accessToken: "tok" },
		);
		expect(out).toEqual({ ok: 1 });
		const [url, init] = fetchSpy.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://sync.example/v1/sync/push");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
		expect(new Headers(init.headers).get("content-type")).toBe(
			"application/json",
		);
		expect(init.body).toBe(JSON.stringify({ changes: [] }));
	});

	it("returns undefined on 204", async () => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
		await expect(
			requestJson(fetchSpy, "POST", "https://s/v1/auth/logout", { body: {} }),
		).resolves.toBeUndefined();
	});

	it("throws SyncHttpError carrying status and stable code", async () => {
		const fetchSpy = vi.fn(async () =>
			jsonResponse(409, {
				statusCode: 409,
				code: "CURSOR_OUT_OF_RANGE",
				message: "…",
			}),
		);
		const err = await requestJson(
			fetchSpy,
			"GET",
			"https://s/v1/sync/pull?cursor=9",
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(SyncHttpError);
		expect((err as SyncHttpError).status).toBe(409);
		expect((err as SyncHttpError).code).toBe("CURSOR_OUT_OF_RANGE");
	});

	it("parses Retry-After seconds when the server sends it", async () => {
		const fetchSpy = vi.fn(async () =>
			jsonResponse(429, { statusCode: 429 }, { "retry-after": "7" }),
		);
		const err = (await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		)) as SyncHttpError;
		expect(err.status).toBe(429);
		expect(err.retryAfterMs).toBe(7_000);
	});

	it("leaves retryAfterMs null when the header is absent or unparseable", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse(429, { statusCode: 429 }));
		const err = (await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		)) as SyncHttpError;
		expect(err.retryAfterMs).toBeNull();
	});

	it("survives a non-JSON error body", async () => {
		const fetchSpy = vi.fn(
			async () => new Response("<html>bad gateway</html>", { status: 502 }),
		);
		const err = (await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		)) as SyncHttpError;
		expect(err.status).toBe(502);
		expect(err.code).toBeNull();
	});

	it("wraps a transport-level rejection (e.g. Tauri's non-TypeError) into SyncNetworkError", async () => {
		// @tauri-apps/plugin-http's fetch rejects with whatever invoke()
		// propagates — often a plain string, not a TypeError.
		const fetchSpy = vi.fn(async () => {
			throw "Network error: could not connect";
		});
		const err = await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(SyncNetworkError);
		expect((err as SyncNetworkError).message).toContain("could not connect");
	});

	it("wraps a browser fetch TypeError into SyncNetworkError too", async () => {
		// The engine deliberately does NOT treat a raw TypeError as offline (it
		// would hide programming bugs), so being offline under browser fetch —
		// which rejects with "TypeError: Failed to fetch" — is recognised as
		// offline solely because this wrapping happens here.
		const fetchSpy = vi.fn(async () => {
			throw new TypeError("Failed to fetch");
		});
		const err = await requestJson(fetchSpy, "GET", "https://s/x").catch(
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(SyncNetworkError);
		expect((err as SyncNetworkError).message).toContain("Failed to fetch");
	});
});
