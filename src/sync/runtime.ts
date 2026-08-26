import type { DbDriver } from "@/db/driver";
import type { TodoRepository } from "@/db/repository";
import { setRepository } from "@/store/repository";
import type { FetchLike } from "./http";
import { initSync, type SyncRuntime } from "./init";

export interface SyncContext {
	db: DbDriver;
	repository: TodoRepository;
	fetchImpl: FetchLike;
	/** Injected so vitest, which has no Tauri runtime, can drive the vault. */
	isUnlocked?: () => Promise<boolean>;
}

let context: SyncContext | null = null;
let current: SyncRuntime | null = null;

/** Called once from App.tsx, with the driver and repository it just built. */
export function setSyncContext(ctx: SyncContext): void {
	context = ctx;
}

/** Read by the production SyncPanelDeps factory, which needs the same db and
 * fetchImpl App.tsx already built rather than threading them through props
 * from SettingsDialog and AppShell. */
export function getSyncContext(): SyncContext {
	if (!context)
		throw new Error(
			"Sync context not initialized. Call setSyncContext() first.",
		);
	return context;
}

export function getSyncRuntime(): SyncRuntime | null {
	return current;
}

/**
 * Builds the engine from whatever the database now says. Signing in writes
 * server_url and refresh_token, then calls this: without it the engine would
 * only come to life at the next launch, since App.tsx runs initSync once.
 */
export async function startSync(): Promise<SyncRuntime | null> {
	if (!context)
		throw new Error(
			"Sync context not initialized. Call setSyncContext() first.",
		);
	// Never leave a previous scheduler ticking behind the new one.
	await stopSync();
	const runtime = await initSync(context.db, context.repository, {
		fetchImpl: context.fetchImpl,
		isUnlocked: context.isUnlocked,
	});
	if (!runtime) return null;
	current = runtime;
	// initSync wraps the repository so local writes debounce a sync.
	setRepository(runtime.repository);
	return runtime;
}

export async function stopSync(): Promise<void> {
	if (!current) return;
	const stopping = current;
	stopping.scheduler.stop();
	current = null;
	// Back to the unwrapped repository: no writes should schedule a sync now.
	if (context) setRepository(context.repository);
	// Stopping the scheduler only prevents FUTURE triggers. A cycle already in
	// flight still writes cursor, clock_offset_ms and last_sync_at — after the
	// caller's own work if it does not wait, which is how sign-out used to
	// resurrect a dead cursor (§6.5).
	await stopping.engine.whenIdle();
}
