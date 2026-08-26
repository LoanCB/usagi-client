// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import {
	AuthorizedHttp,
	register,
	signIn,
	signOut,
	type VaultPort,
} from "./auth";
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
		prepareRegistration: vi.fn(),
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

describe("register", () => {
	it("leaves the vault open: the freshly created account can encrypt right away", async () => {
		const unlockCalls: Array<{
			salt: string;
			wrappedDek: string;
			userId: string;
		}> = [];
		let pendingSalt: string | null = null;
		const vault: VaultPort = {
			async beginUnlock(_password, authSalt) {
				pendingSalt = authSalt;
				return "verifier-from-vault";
			},
			async completeUnlock(wrappedDek, userId) {
				unlockCalls.push({ salt: pendingSalt ?? "", wrappedDek, userId });
			},
			async prepareRegistration(_password) {
				return {
					authSalt: "a".repeat(32),
					authVerifier: "verifier-from-vault",
					wrappedDek: "wrapped-dek",
					wrappedDekRecovery: "wrapped-dek-recovery",
					publicKey: "public-key",
					wrappedPrivateKey: "wrapped-private-key",
					kdfParams: { memoryCost: 65536, timeCost: 3, parallelism: 4 },
					recoveryPhrase: "abandon ability able about above absent absorb",
				};
			},
		};

		const { fetchImpl } = fakeServer({
			"/v1/server-info": () => json(200, SERVER_INFO),
			"/v1/auth/register": () =>
				json(200, {
					userId: "u-42",
					workspaceId: "w-1",
					deviceId: "d-1",
					accessToken: "at-1",
					refreshToken: "rt-1",
				}),
		});

		const result = await register(
			{ db: driver, fetchImpl, baseUrl: "https://sync.example.com", vault },
			{
				email: "a@example.com",
				password: "correct horse battery staple",
				deviceName: "Poste",
				devicePlatform: "linux",
			},
		);

		expect(result.recoveryPhrase).toBeTruthy();
		// The vault was opened with the salt and wrapped DEK that registration
		// just minted, under the identity the server assigned.
		expect(unlockCalls).toHaveLength(1);
		expect(unlockCalls[0].userId).toBe("u-42");
		expect(unlockCalls[0].salt).toMatch(/^[0-9a-f]{32}$/);
		expect(unlockCalls[0].wrappedDek).toBeTruthy();
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

	it("coalesce aussi entre deux instances partageant la même base et la même URL", async () => {
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
		const deps = { db: driver, fetchImpl, baseUrl: "https://s" };
		// The engine holds one instance and the settings panel another; the
		// refresh token is a single shared row, so per-instance coalescing is not
		// enough — the loser's 401 becomes a spurious "sign in again".
		const engineHttp = new AuthorizedHttp(deps);
		const panelHttp = new AuthorizedHttp(deps);
		await Promise.all([
			engineHttp.request("GET", "/v1/sync/pull?cursor=0"),
			panelHttp.request("GET", "/v1/sync/pull?cursor=0"),
		]);
		expect(refreshCalls).toBe(1);
		expect(await getSyncState(driver, "refresh_token")).toBe("refresh-2");
	});

	it("n'inflige pas un refresh coalescé à une autre base", async () => {
		const other = new BetterSqliteDriver();
		try {
			await runMigrations(other, ALL_MIGRATIONS);
			await setSyncState(driver, "refresh_token", "refresh-a");
			await setSyncState(other, "refresh_token", "refresh-b");
			const seen: string[] = [];
			const { fetchImpl } = fakeServer({
				"/v1/auth/refresh": (init) => {
					seen.push(JSON.parse(String(init.body)).refreshToken as string);
					return json(200, {
						accessToken: "access-1",
						refreshToken: "rotated",
					});
				},
				"/v1/sync/": () => json(200, { ok: 1 }),
			});
			await Promise.all([
				new AuthorizedHttp({
					db: driver,
					fetchImpl,
					baseUrl: "https://s",
				}).request("GET", "/v1/sync/pull?cursor=0"),
				new AuthorizedHttp({
					db: other,
					fetchImpl,
					baseUrl: "https://s",
				}).request("GET", "/v1/sync/pull?cursor=0"),
			]);
			expect(seen.sort()).toEqual(["refresh-a", "refresh-b"]);
		} finally {
			other.close();
		}
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
