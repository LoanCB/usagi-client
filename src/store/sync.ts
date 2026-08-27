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
	attach(engine: SyncEngine): void;
	detach(): void;
	refreshLastSync(db: DbDriver): Promise<void>;
}

// Kept outside the store: it is a subscription handle, not rendered state, and
// leaking it would keep a dead engine's listener alive across a reconnect.
let unsubscribe: (() => void) | null = null;

export const useSyncStore = create<SyncStore>((set) => ({
	status: null,
	lastSyncAt: null,
	revision: 0,

	attach(engine) {
		unsubscribe?.();
		unsubscribe = engine.onStatus((status) =>
			set((prev) => ({
				status,
				// Only a cycle that ran to completion can have applied rows. Leaving
				// "syncing" for locked/reauth-required/protocol-mismatch means it
				// stopped early, so there is nothing new to show.
				revision:
					prev.status === "syncing" && status === "idle"
						? prev.revision + 1
						: prev.revision,
			})),
		);
		set({ status: engine.getStatus() });
	},

	detach() {
		unsubscribe?.();
		unsubscribe = null;
		set({ status: null, lastSyncAt: null });
	},

	async refreshLastSync(db) {
		set({ lastSyncAt: await getSyncState(db, "last_sync_at") });
	},
}));
