import { create } from "zustand";
import type { DbDriver } from "@/db/driver";
import type { SyncEngine } from "@/sync/engine";
import { getSyncState } from "@/sync/state";
import type { SyncStatus } from "@/sync/types";

interface SyncStore {
	/** null means sync is not configured at all — no server_url (§6.1). */
	status: SyncStatus | null;
	lastSyncAt: string | null;
	/**
	 * Bumped every time a sync cycle finishes.
	 *
	 * The engine applies pulled rows straight to SQLite; nothing about that
	 * reaches the stores the UI renders from, so a task created on another
	 * device lands in the database and stays invisible until the next launch.
	 * Views watch this and reload themselves — each with its own filters, which
	 * is why this is a signal rather than a central reload.
	 */
	revision: number;
	/** Also takes the db: the engine writes last_sync_at itself at the end of
	 * every cycle, including the ones it starts on its own (timer, first sync
	 * after a merge), so only the store is in a position to re-read it. */
	attach(engine: SyncEngine, db: DbDriver): void;
	detach(): void;
}

// Kept outside the store: it is a subscription handle, not rendered state, and
// leaking it would keep a dead engine's listener alive across a reconnect.
let unsubscribe: (() => void) | null = null;
// Bumped on every attach/detach so a last_sync_at read that resolves late
// cannot write a previous session's value into the current one.
let generation = 0;

export const useSyncStore = create<SyncStore>((set, get) => ({
	status: null,
	lastSyncAt: null,
	revision: 0,

	attach(engine, db) {
		unsubscribe?.();
		const current = ++generation;
		const refreshLastSync = async () => {
			const lastSyncAt = await getSyncState(db, "last_sync_at");
			if (current === generation) set({ lastSyncAt });
		};
		unsubscribe = engine.onStatus((status) => {
			// Only a cycle that ran to completion can have applied rows. Leaving
			// "syncing" for locked/reauth-required/protocol-mismatch means it
			// stopped early, so there is nothing new to show.
			const completed = get().status === "syncing" && status === "idle";
			set((prev) => ({
				status,
				revision: completed ? prev.revision + 1 : prev.revision,
			}));
			if (completed) void refreshLastSync();
		});
		set({ status: engine.getStatus() });
		void refreshLastSync();
	},

	detach() {
		unsubscribe?.();
		unsubscribe = null;
		generation++;
		set({ status: null, lastSyncAt: null });
	},
}));
