import { beforeEach, describe, expect, it } from "vitest";
import type { SyncEngine } from "@/sync/engine";
import type { SyncStatus } from "@/sync/types";
import { useSyncStore } from "./sync";

/** Minimal stand-in: the store only ever touches getStatus and onStatus. */
function fakeEngine(initial: SyncStatus = "idle") {
	const listeners = new Set<(s: SyncStatus) => void>();
	let status = initial;
	return {
		engine: {
			getStatus: () => status,
			onStatus(listener: (s: SyncStatus) => void) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		} as unknown as SyncEngine,
		emit(next: SyncStatus) {
			status = next;
			for (const listener of listeners) listener(next);
		},
		listenerCount: () => listeners.size,
	};
}

describe("useSyncStore", () => {
	beforeEach(() => {
		useSyncStore.getState().detach();
	});

	it("part d'un statut nul quand la sync n'est pas configurée", () => {
		expect(useSyncStore.getState().status).toBeNull();
	});

	it("adopte le statut courant du moteur dès l'attachement", () => {
		const { engine } = fakeEngine("locked");
		useSyncStore.getState().attach(engine);
		expect(useSyncStore.getState().status).toBe("locked");
	});

	it("suit les transitions émises par le moteur", () => {
		const { engine, emit } = fakeEngine("idle");
		useSyncStore.getState().attach(engine);
		emit("syncing");
		expect(useSyncStore.getState().status).toBe("syncing");
		emit("reauth-required");
		expect(useSyncStore.getState().status).toBe("reauth-required");
	});

	it("se désabonne à detach et repasse à null", () => {
		const { engine, emit, listenerCount } = fakeEngine("idle");
		useSyncStore.getState().attach(engine);
		useSyncStore.getState().detach();
		expect(listenerCount()).toBe(0);
		expect(useSyncStore.getState().status).toBeNull();
		emit("syncing");
		expect(useSyncStore.getState().status).toBeNull();
	});

	it("ne laisse pas fuir l'abonnement au moteur précédent", () => {
		const first = fakeEngine("idle");
		const second = fakeEngine("idle");
		useSyncStore.getState().attach(first.engine);
		useSyncStore.getState().attach(second.engine);
		expect(first.listenerCount()).toBe(0);
		first.emit("protocol-mismatch");
		expect(useSyncStore.getState().status).toBe("idle");
	});
});
