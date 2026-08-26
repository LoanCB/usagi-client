// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { AuthorizedHttp, signIn, signOut } from "./auth";
import { getSyncState, setSyncState } from "./state";
import { ProtocolMismatchError, ReauthRequiredError } from "./types";

let driver: BetterSqliteDriver;

beforeEach(async () => {
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
});
afterEach(() => driver?.close());

const SERVER_INFO = {
	name: "usagi-server",
	version: "1.0.0",
	protocolVersion: 1,
	registrationEnabled: false,
	minClientVersion: "0.1.0",
};

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Routes requests by path suffix; records every call for assertions. */
function fakeServer(routes: Record<string, (init: RequestInit) => Response>) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const fetchImpl = vi.fn(
		async (url: RequestInfo | URL, init?: RequestInit) => {
			const u = String(url);
			calls.push({ url: u, init: init ?? {} });
			for (const [suffix, handler] of Object.entries(routes)) {
				if (u.includes(suffix)) return handler(init ?? {});
			}
			return json(404, { statusCode: 404 });
		},
	);
	return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("signIn", () => {
	const vault = {
		beginUnlock: vi.fn(async () => "verifier-from-argon2"),
		completeUnlock: vi.fn(async () => undefined),
	};

	it("runs prelogin → login → keys → completeUnlock and persists the session", async () => {
		const { fetchImpl, calls } = fakeServer({
			"/v1/server-info": () => json(200, SERVER_INFO),
			"/v1/auth/prelogin": () =>
				json(200, {
					salt: "a".repeat(32),
					kdfParams: { memoryCost: 65536, timeCost: 3, parallelism: 4 },
				}),
			"/v1/auth/login": () =>
				json(200, {
					userId: "user-1",
					workspaceId: "ws-1",
					deviceId: "srv-dev-1",
					accessToken: "access-1",
					refreshToken: "refresh-1",
				}),
			"/v1/keys": () =>
				json(200, {
					wrappedDek: "d",
					wrappedDekRecovery: "r",
					publicKey: "p",
					wrappedPrivateKey: "k",
				}),
		});

		const out = await signIn(
			{ db: driver, fetchImpl, baseUrl: "https://sync.example", vault },
			{
				email: "loan@example.com",
				password: "pw",
				deviceName: "Desktop",
				devicePlatform: "linux",
			},
		);

		expect(out.accessToken).toBe("access-1");
		expect(vault.beginUnlock).toHaveBeenCalledWith("pw", "a".repeat(32));
		expect(vault.completeUnlock).toHaveBeenCalledWith("d", "user-1");
		expect(await getSyncState(driver, "refresh_token")).toBe("refresh-1");
		expect(await getSyncState(driver, "user_id")).toBe("user-1");
		expect(await getSyncState(driver, "server_url")).toBe(
			"https://sync.example",
		);
		// The login body carries the derived verifier, never the password.
		const loginCall = calls.find((c) => c.url.includes("/v1/auth/login"));
		expect(loginCall?.init.body).not.toContain("pw");
		expect(loginCall?.init.body).toContain("verifier-from-argon2");
	});

	it("refuses to sign in against an incompatible protocol (§4.0)", async () => {
		const { fetchImpl, calls } = fakeServer({
			"/v1/server-info": () =>
				json(200, { ...SERVER_INFO, protocolVersion: 2 }),
		});
		await expect(
			signIn(
				{ db: driver, fetchImpl, baseUrl: "https://sync.example", vault },
				{
					email: "e@x.com",
					password: "pw",
					deviceName: "D",
					devicePlatform: "linux",
				},
			),
		).rejects.toThrow(ProtocolMismatchError);
		// Refusal happens before any credential-bearing request leaves.
		expect(calls.every((c) => c.url.includes("/v1/server-info"))).toBe(true);
	});
});

describe("AuthorizedHttp", () => {
	it("refreshes once on 401, persists the rotated token, retries the request", async () => {
		await setSyncState(driver, "refresh_token", "refresh-old");
		const tokenAccepted = "access-good";
		const { fetchImpl, calls } = fakeServer({
			"/v1/auth/refresh": (init) => {
				expect(init.body).toBe(JSON.stringify({ refreshToken: "refresh-old" }));
				return json(200, {
					accessToken: "access-good",
					refreshToken: "refresh-new",
				});
			},
			"/v1/sync/pull": (init) => {
				const auth = new Headers(init.headers).get("authorization");
				return auth === `Bearer ${tokenAccepted}`
					? json(200, {
							records: [],
							nextCursor: 0,
							hasMore: false,
							serverTime: "2026-08-25T10:00:00.000Z",
						})
					: json(401, { statusCode: 401 });
			},
		});

		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://sync.example",
			seedAccessToken: "access-stale",
		});
		const res = await http.request<{ nextCursor: number }>(
			"GET",
			"/v1/sync/pull?cursor=0",
		);
		expect(res.nextCursor).toBe(0);
		expect(await getSyncState(driver, "refresh_token")).toBe("refresh-new");
		// stale attempt + refresh + retried attempt = 3 calls exactly
		expect(calls).toHaveLength(3);
	});

	it("acquires a token via refresh when it has none (app restart path)", async () => {
		await setSyncState(driver, "refresh_token", "refresh-old");
		const { fetchImpl } = fakeServer({
			"/v1/auth/refresh": () =>
				json(200, { accessToken: "access-1", refreshToken: "refresh-2" }),
			"/v1/sync/pull": (init) =>
				new Headers(init.headers).get("authorization") === "Bearer access-1"
					? json(200, {
							records: [],
							nextCursor: 0,
							hasMore: false,
							serverTime: "2026-08-25T10:00:00.000Z",
						})
					: json(401, { statusCode: 401 }),
		});
		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://s",
		});
		await expect(
			http.request("GET", "/v1/sync/pull?cursor=0"),
		).resolves.toBeDefined();
	});

	it("throws ReauthRequiredError when the refresh itself is rejected (§7 revoked device)", async () => {
		await setSyncState(driver, "refresh_token", "refresh-revoked");
		const { fetchImpl } = fakeServer({
			"/v1/auth/refresh": () => json(401, { statusCode: 401 }),
			"/v1/sync/pull": () => json(401, { statusCode: 401 }),
		});
		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://s",
			seedAccessToken: "stale",
		});
		await expect(http.request("GET", "/v1/sync/pull?cursor=0")).rejects.toThrow(
			ReauthRequiredError,
		);
	});

	it("throws ReauthRequiredError when no refresh token is stored", async () => {
		const { fetchImpl } = fakeServer({});
		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://s",
		});
		await expect(http.request("GET", "/v1/sync/pull?cursor=0")).rejects.toThrow(
			ReauthRequiredError,
		);
	});

	it("coalesces concurrent refreshes into one (rotation would burn the token)", async () => {
		await setSyncState(driver, "refresh_token", "refresh-old");
		let refreshCalls = 0;
		const { fetchImpl } = fakeServer({
			"/v1/auth/refresh": () => {
				refreshCalls++;
				return json(200, {
					accessToken: "access-1",
					refreshToken: "refresh-2",
				});
			},
			"/v1/sync/": (init) =>
				new Headers(init.headers).get("authorization") === "Bearer access-1"
					? json(200, { ok: 1 })
					: json(401, { statusCode: 401 }),
		});
		const http = new AuthorizedHttp({
			db: driver,
			fetchImpl,
			baseUrl: "https://s",
		});
		await Promise.all([
			http.request("GET", "/v1/sync/pull?cursor=0"),
			http.request("GET", "/v1/sync/pull?cursor=0"),
		]);
		// The server rotates the token on every refresh: a second concurrent
		// refresh presenting the same old token would be a 401 and a lockout.
		expect(refreshCalls).toBe(1);
	});
});

describe("signOut", () => {
	it("efface tout l'état de sync et l'outbox, sans toucher aux données métier", async () => {
		const repo = new SqliteRepository(driver);

		// Données métier + outbox alimentée par les triggers.
		await repo.createProject({ name: "À conserver" });

		for (const [key, value] of [
			["server_url", "https://sync.example.com"],
			["refresh_token", "rt-1"],
			["cursor", "42"],
			["user_id", "u-1"],
			["account_email", "a@example.com"],
			["first_sync_resolved", "1"],
			["last_sync_at", "2026-08-26T10:00:00.000Z"],
			["clock_offset_ms", "1500"],
		] as const) {
			await setSyncState(driver, key, value);
		}
		await driver.execute(
			"INSERT INTO sync_quarantine (entity_type, entity_id, direction, reason, quarantined_at) VALUES ('task', 'q1', 'pull', 'decrypt-failed', '2026-08-26T10:00:00.000Z')",
		);

		await signOut({
			db: driver,
			fetchImpl: async () => new Response(null, { status: 204 }),
			baseUrl: "https://sync.example.com",
		});

		for (const key of [
			"server_url",
			"refresh_token",
			"cursor",
			"user_id",
			"account_email",
			"first_sync_resolved",
			"last_sync_at",
			"clock_offset_ms",
		] as const) {
			expect(await getSyncState(driver, key)).toBeNull();
		}
		const outbox = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM sync_outbox",
		);
		expect(outbox[0].n).toBe(0);
		const quarantine = await driver.select<{ n: number }>(
			"SELECT COUNT(*) AS n FROM sync_quarantine",
		);
		expect(quarantine[0].n).toBe(0);

		// Le SQLite métier est intact : l'app locale doit survivre entière.
		expect(await repo.getProjects()).toHaveLength(1);
	});

	it("efface localement même si le serveur est injoignable", async () => {
		await setSyncState(driver, "refresh_token", "rt-1");
		await setSyncState(driver, "server_url", "https://sync.example.com");

		await signOut({
			db: driver,
			fetchImpl: async () => {
				throw new TypeError("network down");
			},
			baseUrl: "https://sync.example.com",
		});

		expect(await getSyncState(driver, "refresh_token")).toBeNull();
		expect(await getSyncState(driver, "server_url")).toBeNull();
	});
});
