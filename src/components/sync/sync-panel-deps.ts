import { lock, completeUnlock as vaultCompleteUnlock } from "@/crypto";
import type { DbDriver } from "@/db/driver";
import i18n from "@/i18n";
import { useSyncStore } from "@/store/sync";
import {
	AuthorizedHttp,
	getServerInfo,
	prelogin,
	register as registerAccount,
	signIn as signInAccount,
	signOut as signOutAccount,
	tauriVault,
} from "@/sync/auth";
import { listDevices, revokeDevice } from "@/sync/devices";
import { SyncNetworkError } from "@/sync/http";
import {
	getSyncContext,
	getSyncRuntime,
	type SyncContext,
	startSync,
	stopSync,
} from "@/sync/runtime";
import { getSyncState } from "@/sync/state";
import {
	ReauthRequiredError,
	SyncUnlockOfflineError,
	SyncUnlockReauthError,
} from "@/sync/types";
import type { SyncPanelDeps, SyncSession } from "./SyncPanel";

/** No @tauri-apps/plugin-os in this project: derive a best-effort platform
 * label from the browser APIs the webview exposes, same pattern as
 * `isMac()` in @/lib/utils. */
function devicePlatform(): string {
	const platform =
		(navigator as Navigator & { userAgentData?: { platform: string } })
			.userAgentData?.platform ?? navigator.userAgent;
	return platform.slice(0, 64);
}

/** No hostname API is exposed to the webview and no Tauri plugin is installed
 * to read one, so the device list shows a generic translated label. This
 * module is not a component, so it reaches the i18next singleton directly
 * rather than through useTranslation(). The server caps deviceName at 128. */
function defaultDeviceName(): string {
	return i18n.t("sync.defaultDeviceName").slice(0, 128);
}

/** startSync already rebuilds the engine from sync_state and calls
 * setRepository internally (see runtime.ts); attach the store to it so the
 * status banner and panel see the fresh engine right after sign-in/register. */
async function startAndAttach(): Promise<void> {
	const runtime = await startSync();
	if (runtime) useSyncStore.getState().attach(runtime.engine);
}

async function requireBaseUrl(db: DbDriver): Promise<string> {
	const url = await getSyncState(db, "server_url");
	if (!url)
		throw new Error("sync: server_url missing while a session was expected");
	return url;
}

function buildSyncDeps({ db, fetchImpl }: SyncContext): SyncPanelDeps {
	// One AuthorizedHttp per (db, baseUrl), reused by every authenticated panel
	// action. A fresh instance starts with no access token, so each action would
	// otherwise force its own refresh — and the refresh token is a single shared
	// row, so a panel refresh racing the engine's used to burn it and report a
	// spurious "sign in again".
	let authorized: { baseUrl: string; http: AuthorizedHttp } | null = null;
	function http(baseUrl: string): AuthorizedHttp {
		if (authorized?.baseUrl !== baseUrl) {
			authorized = {
				baseUrl,
				http: new AuthorizedHttp({ db, fetchImpl, baseUrl }),
			};
		}
		return authorized.http;
	}

	return {
		async loadSession(): Promise<SyncSession | null> {
			const [accountEmail, serverUrl] = await Promise.all([
				getSyncState(db, "account_email"),
				getSyncState(db, "server_url"),
			]);
			if (!accountEmail || !serverUrl) return null;
			return { accountEmail, serverUrl };
		},

		probe(url) {
			return getServerInfo(fetchImpl, url);
		},

		async signIn({ serverUrl, email, password }) {
			await signInAccount(
				{ db, fetchImpl, baseUrl: serverUrl, vault: tauriVault },
				{
					email,
					password,
					deviceName: defaultDeviceName(),
					devicePlatform: devicePlatform(),
				},
			);
			// The stored access/refresh pair is brand new: drop the instance that
			// still carries the dead session's token.
			authorized = null;
			await startAndAttach();
		},

		async register({ serverUrl, email, password, inviteToken }) {
			const result = await registerAccount(
				{ db, fetchImpl, baseUrl: serverUrl, vault: tauriVault },
				{
					email,
					password,
					inviteToken,
					deviceName: defaultDeviceName(),
					devicePlatform: devicePlatform(),
				},
			);
			authorized = null;
			await startAndAttach();
			return result.recoveryPhrase;
		},

		async signOut() {
			const baseUrl = await requireBaseUrl(db);
			// Order matters. signOutAccount POSTs /v1/auth/logout first, which can
			// hang for a full timeout; a scheduler still live during that window
			// could rewrite cursor, clock_offset_ms or last_sync_at AFTER the wipe
			// transaction commits. A resurrected cursor that lands inside the next
			// server's seq range never trips the 409 CURSOR_OUT_OF_RANGE guard, so
			// the client silently skips every record below it (§6.5).
			await stopSync();
			// §6.5: disconnecting erases the in-memory keys. Without this the DEK
			// survives sign-out — including into a different account.
			await lock();
			authorized = null;
			await signOutAccount({ db, fetchImpl, baseUrl });
			useSyncStore.getState().detach();
		},

		/**
		 * prelogin → beginUnlock → GET /v1/keys → completeUnlock, then a sync so
		 * whatever queued up while locked flushes immediately. The session is
		 * already authenticated (AuthorizedHttp carries the stored refresh
		 * token); the password here only re-derives the KEK client-side.
		 */
		async unlock(password) {
			const [email, userId, serverUrl] = await Promise.all([
				getSyncState(db, "account_email"),
				getSyncState(db, "user_id"),
				getSyncState(db, "server_url"),
			]);
			if (!email || !userId || !serverUrl) {
				// No session to unlock into is itself a transport-shaped problem
				// from the dialog's point of view: there is nothing wrong with the
				// password the user just typed.
				throw new SyncUnlockOfflineError();
			}
			try {
				const pre = await prelogin(fetchImpl, serverUrl, email);
				await tauriVault.beginUnlock(password, pre.salt);
				const keys = await http(serverUrl).request<{ wrappedDek: string }>(
					"GET",
					"/v1/keys",
				);
				await vaultCompleteUnlock(keys.wrappedDek, userId);
			} catch (err) {
				// A revoked refresh token rejects the key fetch with a 401 that has
				// nothing to do with the password: reported as "wrong password" it
				// makes the user retype a correct one forever.
				if (err instanceof ReauthRequiredError)
					throw new SyncUnlockReauthError();
				if (err instanceof SyncNetworkError) throw new SyncUnlockOfflineError();
				throw err;
			}
			await getSyncRuntime()?.engine.syncNow();
		},

		async syncNow() {
			await getSyncRuntime()?.engine.syncNow();
			await useSyncStore.getState().refreshLastSync(db);
		},

		async listDevices() {
			const baseUrl = await requireBaseUrl(db);
			return listDevices(http(baseUrl));
		},

		async revokeDevice(id) {
			const baseUrl = await requireBaseUrl(db);
			await revokeDevice(http(baseUrl), id);
		},
	};
}

let cached: { context: SyncContext; deps: SyncPanelDeps } | null = null;

/**
 * Builds SyncPanelDeps from the real database, network and vault. The panel
 * itself stays a pure function of injected deps (see SyncPanel.tsx); this is
 * the only module that wires it to Tauri. Reads db/fetchImpl from the sync
 * context App.tsx sets at startup, so call sites need no plumbing of their own.
 *
 * The result is memoised on that context: SettingsDialog calls this in render,
 * and SyncPanel's mount effect and DeviceList's refresh both key on the deps
 * identity — a fresh object per render would refetch the device list on every
 * keystroke elsewhere in the app.
 */
export function productionSyncDeps(): SyncPanelDeps {
	const context = getSyncContext();
	if (cached?.context !== context) {
		cached = { context, deps: buildSyncDeps(context) };
	}
	return cached.deps;
}
