import { create } from "zustand";
import type { DbDriver } from "@/db/driver";
import type { SyncEngine } from "@/sync/engine";
import { getSyncState } from "@/sync/state";
import type { SyncStatus } from "@/sync/types";

interface SyncStore {
	/** null means sync is not configured at all — no server_url (§6.1). */
	status: SyncStatus | null;
	lastSyncAt: string | null;
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

	attach(engine) {
		unsubscribe?.();
		unsubscribe = engine.onStatus((status) => set({ status }));
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
