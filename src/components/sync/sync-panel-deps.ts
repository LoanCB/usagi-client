import { completeUnlock as vaultCompleteUnlock } from "@/crypto";
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
	startSync,
	stopSync,
} from "@/sync/runtime";
import { getSyncState } from "@/sync/state";
import { SyncUnlockOfflineError } from "@/sync/types";
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

/**
 * Builds SyncPanelDeps from the real database, network and vault. The panel
 * itself stays a pure function of injected deps (see SyncPanel.tsx); this is
 * the only module that wires it to Tauri. Reads db/fetchImpl from the sync
 * context App.tsx sets at startup, so call sites need no plumbing of their own.
 */
export function productionSyncDeps(): SyncPanelDeps {
	const { db, fetchImpl } = getSyncContext();
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
			await startAndAttach();
			return result.recoveryPhrase;
		},

		async signOut() {
			const baseUrl = await requireBaseUrl(db);
			await signOutAccount({ db, fetchImpl, baseUrl });
			await stopSync();
			useSyncStore.getState().detach();
		},

		/**
		 * prelogin → beginUnlock → GET /v1/keys → completeUnlock, then a sync so
		 * whatever queued up while locked flushes immediately. The session is
		 * already authenticated (AuthorizedHttp carries the stored refresh
		 * token); the password here only re-derives the KEK client-side.
		 */
		async unlock(password) {
			const email = await getSyncState(db, "account_email");
			const userId = await getSyncState(db, "user_id");
			const serverUrl = await getSyncState(db, "server_url");
			if (!email || !userId || !serverUrl) {
				// No session to unlock into is itself a transport-shaped problem
				// from the dialog's point of view: there is nothing wrong with the
				// password the user just typed.
				throw new SyncUnlockOfflineError();
			}
			try {
				const pre = await prelogin(fetchImpl, serverUrl, email);
				await tauriVault.beginUnlock(password, pre.salt);
				const http = new AuthorizedHttp({ db, fetchImpl, baseUrl: serverUrl });
				const keys = await http.request<{ wrappedDek: string }>(
					"GET",
					"/v1/keys",
				);
				await vaultCompleteUnlock(keys.wrappedDek, userId);
			} catch (err) {
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
			return listDevices(new AuthorizedHttp({ db, fetchImpl, baseUrl }));
		},

		async revokeDevice(id) {
			const baseUrl = await requireBaseUrl(db);
			await revokeDevice(new AuthorizedHttp({ db, fetchImpl, baseUrl }), id);
		},
	};
}
