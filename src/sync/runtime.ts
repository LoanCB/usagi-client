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
	current.scheduler.stop();
	current = null;
	// Back to the unwrapped repository: no writes should schedule a sync now.
	if (context) setRepository(context.repository);
}
