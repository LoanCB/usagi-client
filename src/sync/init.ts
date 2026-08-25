import { lock } from "@/crypto";
import type { DbDriver } from "@/db/driver";
import type { TodoRepository } from "@/db/repository";
import { AuthorizedHttp, getServerInfo } from "./auth";
import { RequestGate } from "./backoff";
import { TauriRecordCipher } from "./cipher";
import { SyncEngine } from "./engine";
import type { FetchLike } from "./http";
import { withWriteNotifications } from "./notifying-repository";
import { SyncScheduler } from "./scheduler";
import { getSyncState } from "./state";
import { HttpSyncTransport } from "./transport";
import type { RecordCipher } from "./types";

export interface SyncRuntime {
	engine: SyncEngine;
	scheduler: SyncScheduler;
	repository: TodoRepository;
}

/**
 * Spec §6.1: without a server_url the engine is NEVER instantiated — no
 * timer, no request, no login screen, zero added latency. Pinned by the §8.2
 * non-regression test. fetch is injected by the caller (App passes
 * @tauri-apps/plugin-http's fetch) so this module stays testable under node.
 */
export async function initSync(
	db: DbDriver,
	repository: TodoRepository,
	deps: { fetchImpl: FetchLike; cipher?: RecordCipher },
): Promise<SyncRuntime | null> {
	const serverUrl = await getSyncState(db, "server_url");
	if (!serverUrl) return null;
	const refreshToken = await getSyncState(db, "refresh_token");
	if (!refreshToken) return null;

	const http = new AuthorizedHttp({
		db,
		fetchImpl: deps.fetchImpl,
		baseUrl: serverUrl,
	});
	const engine = new SyncEngine({
		db,
		transport: new HttpSyncTransport(http, new RequestGate()),
		cipher: deps.cipher ?? new TauriRecordCipher(),
		getServerInfo: () => getServerInfo(deps.fetchImpl, serverUrl),
	});
	engine.onStatus((status) => {
		// §7 revoked device: a permanent 401 locks the vault and erases the
		// in-memory keys. The local SQLite is untouched — the app stays usable.
		if (status === "reauth-required") void lock();
	});
	const scheduler = new SyncScheduler(engine);
	const notifying = withWriteNotifications(repository, () =>
		scheduler.notifyLocalWrite(),
	);
	scheduler.start();
	return { engine, scheduler, repository: notifying };
}
