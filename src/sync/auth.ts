import {
	beginUnlock,
	completeUnlock,
	prepareRegistration,
	type RegistrationMaterial,
	toRegisterKeys,
} from "@/crypto";
import type { DbDriver } from "@/db/driver";
import { type FetchLike, requestJson, SyncHttpError } from "./http";
import {
	deleteSyncState,
	getSyncState,
	type SyncStateKey,
	setSyncState,
} from "./state";
import {
	CLIENT_PROTOCOL_VERSION,
	ProtocolMismatchError,
	ReauthRequiredError,
	type ServerInfo,
} from "./types";

/**
 * The Argon2id work happens in Rust and vitest has no Tauri runtime, so the
 * two vault calls the sign-in path needs are injected as a port.
 */
export interface VaultPort {
	beginUnlock(password: string, authSalt: string): Promise<string>;
	completeUnlock(wrappedDek: string, userId: string): Promise<void>;
	prepareRegistration(password: string): Promise<RegistrationMaterial>;
}

export const tauriVault: VaultPort = {
	beginUnlock,
	completeUnlock,
	prepareRegistration,
};

interface AuthDeps {
	db: DbDriver;
	fetchImpl: FetchLike;
	baseUrl: string;
	vault: VaultPort;
}

interface LoginResponse {
	userId: string;
	workspaceId: string;
	deviceId: string;
	accessToken: string;
	refreshToken: string;
}

export interface KeysResponse {
	wrappedDek: string;
	wrappedDekRecovery: string;
	publicKey: string;
	wrappedPrivateKey: string;
}

export interface PreloginResponse {
	salt: string;
	kdfParams: unknown;
}

export function getServerInfo(
	fetchImpl: FetchLike,
	baseUrl: string,
): Promise<ServerInfo> {
	return requestJson<ServerInfo>(fetchImpl, "GET", `${baseUrl}/v1/server-info`);
}

/** Shared by signIn and the standalone unlock flow (re-deriving the DEK for an
 * already-authenticated session): both need the account's KDF salt. */
export function prelogin(
	fetchImpl: FetchLike,
	baseUrl: string,
	email: string,
): Promise<PreloginResponse> {
	return requestJson<PreloginResponse>(
		fetchImpl,
		"POST",
		`${baseUrl}/v1/auth/prelogin`,
		{ body: { email } },
	);
}

async function assertProtocol(
	fetchImpl: FetchLike,
	baseUrl: string,
): Promise<void> {
	const info = await getServerInfo(fetchImpl, baseUrl);
	// Spec §4.0: refuse outright on any mismatch — a half-sync against an
	// outdated self-hosted server is worse than a loud error.
	if (info.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
		throw new ProtocolMismatchError(info);
	}
}

async function persistSession(
	db: DbDriver,
	baseUrl: string,
	email: string,
	login: LoginResponse,
): Promise<void> {
	await setSyncState(db, "refresh_token", login.refreshToken);
	await setSyncState(db, "user_id", login.userId);
	await setSyncState(db, "account_email", email);
	await setSyncState(db, "server_url", baseUrl);
}

export async function signIn(
	deps: AuthDeps,
	input: {
		email: string;
		password: string;
		deviceName: string;
		devicePlatform: string;
	},
): Promise<{ accessToken: string }> {
	await assertProtocol(deps.fetchImpl, deps.baseUrl);
	const pre = await prelogin(deps.fetchImpl, deps.baseUrl, input.email);
	// kdfParams are returned for forward compatibility; the Rust side pins the
	// current defaults itself. Revisit when the server ever raises them.
	const authVerifier = await deps.vault.beginUnlock(input.password, pre.salt);
	const login = await requestJson<LoginResponse>(
		deps.fetchImpl,
		"POST",
		`${deps.baseUrl}/v1/auth/login`,
		{
			body: {
				email: input.email,
				authVerifier,
				deviceName: input.deviceName,
				devicePlatform: input.devicePlatform,
			},
		},
	);
	const keys = await requestJson<KeysResponse>(
		deps.fetchImpl,
		"GET",
		`${deps.baseUrl}/v1/keys`,
		{ accessToken: login.accessToken },
	);
	await deps.vault.completeUnlock(keys.wrappedDek, login.userId);
	await persistSession(deps.db, deps.baseUrl, input.email, login);
	return { accessToken: login.accessToken };
}

export async function register(
	deps: AuthDeps,
	input: {
		email: string;
		password: string;
		deviceName: string;
		devicePlatform: string;
		inviteToken?: string;
	},
): Promise<{ accessToken: string; recoveryPhrase: string }> {
	await assertProtocol(deps.fetchImpl, deps.baseUrl);
	const material = await deps.vault.prepareRegistration(input.password);
	const login = await requestJson<LoginResponse>(
		deps.fetchImpl,
		"POST",
		`${deps.baseUrl}/v1/auth/register`,
		{
			body: {
				email: input.email,
				authVerifier: material.authVerifier,
				authSalt: material.authSalt,
				keys: toRegisterKeys(material),
				deviceName: input.deviceName,
				devicePlatform: input.devicePlatform,
				...(input.inviteToken ? { inviteToken: input.inviteToken } : {}),
			},
		},
	);
	// crypto_prepare_registration is stateless: it mints the material without
	// loading the DEK. Without this the brand-new account starts locked and the
	// engine sits on "locked" until the user retypes the password they just
	// chose. Only the userId the server assigns was missing to open the vault.
	await deps.vault.beginUnlock(input.password, material.authSalt);
	await deps.vault.completeUnlock(material.wrappedDek, login.userId);
	await persistSession(deps.db, deps.baseUrl, input.email, login);
	// recoveryPhrase is real key material: shown once by the caller (plan 4d),
	// never persisted, never logged.
	return {
		accessToken: login.accessToken,
		recoveryPhrase: material.recoveryPhrase,
	};
}

/** Every sync_state key signOut clears. Listed rather than "DELETE FROM
 * sync_state" so a key added later is a deliberate decision here, not a
 * silent inclusion. */
const SIGNED_OUT_KEYS: SyncStateKey[] = [
	"server_url",
	"cursor",
	"clock_offset_ms",
	"refresh_token",
	"user_id",
	"account_email",
	"first_sync_resolved",
	"last_sync_at",
];

export async function signOut(deps: {
	db: DbDriver;
	fetchImpl: FetchLike;
	baseUrl: string;
}): Promise<void> {
	const refreshToken = await getSyncState(deps.db, "refresh_token");
	if (refreshToken) {
		try {
			await requestJson(
				deps.fetchImpl,
				"POST",
				`${deps.baseUrl}/v1/auth/logout`,
				{
					body: { refreshToken },
				},
			);
		} catch {
			// Best effort: the local wipe is what signs this device out; the
			// server-side revocation just also closes the session remotely.
		}
	}
	// One transaction: a partial wipe would leave a server_url without a
	// refresh token, which initSync reads as "configured" and retries forever.
	await deps.db.transaction(async (tx) => {
		for (const key of SIGNED_OUT_KEYS) await deleteSyncState(tx, key);
		await tx.execute("DELETE FROM sync_outbox");
		await tx.execute("DELETE FROM sync_quarantine");
	});
}

/**
 * Bearer plumbing for every authenticated call. The access token lives only in
 * memory; the refresh token is the persisted credential and the server rotates
 * it on every refresh, so the fresh one is persisted before anything reuses it
 * and concurrent refreshes are coalesced (a second refresh presenting the
 * already-burnt token would 401 and needlessly force a re-login).
 */
export class AuthorizedHttp {
	private accessToken: string | null;
	private refreshing: Promise<string> | null = null;

	constructor(
		private readonly deps: {
			db: DbDriver;
			fetchImpl: FetchLike;
			baseUrl: string;
			seedAccessToken?: string;
		},
	) {
		this.accessToken = deps.seedAccessToken ?? null;
	}

	async request<T>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		body?: unknown,
	): Promise<T> {
		const token = this.accessToken ?? (await this.refresh());
		try {
			return await requestJson<T>(
				this.deps.fetchImpl,
				method,
				this.deps.baseUrl + path,
				{ body, accessToken: token },
			);
		} catch (err) {
			if (err instanceof SyncHttpError && err.status === 401) {
				const fresh = await this.refresh();
				return requestJson<T>(
					this.deps.fetchImpl,
					method,
					this.deps.baseUrl + path,
					{
						body,
						accessToken: fresh,
					},
				);
			}
			throw err;
		}
	}

	private refresh(): Promise<string> {
		this.refreshing ??= this.doRefresh().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	private async doRefresh(): Promise<string> {
		const stored = await getSyncState(this.deps.db, "refresh_token");
		if (!stored) throw new ReauthRequiredError("no refresh token stored");
		let res: { accessToken: string; refreshToken: string };
		try {
			res = await requestJson(
				this.deps.fetchImpl,
				"POST",
				`${this.deps.baseUrl}/v1/auth/refresh`,
				{ body: { refreshToken: stored } },
			);
		} catch (err) {
			if (err instanceof SyncHttpError && err.status === 401) {
				throw new ReauthRequiredError("refresh token rejected");
			}
			throw err;
		}
		await setSyncState(this.deps.db, "refresh_token", res.refreshToken);
		this.accessToken = res.accessToken;
		return res.accessToken;
	}
}
