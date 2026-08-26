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
	it("signale un cycle terminé pour que les vues se rechargent", async () => {
		const { engine, emit } = fakeEngine("idle");
		useSyncStore.getState().attach(engine);
		const before = useSyncStore.getState().revision;

		// Un cycle complet : le moteur a écrit dans SQLite sans passer par le
		// repository, donc rien n'a invalidé les stores.
		emit("syncing");
		emit("idle");
		expect(useSyncStore.getState().revision).toBe(before + 1);
	});

	it("ne signale rien quand le cycle s'arrête avant d'appliquer", () => {
		const { engine, emit } = fakeEngine("idle");
		useSyncStore.getState().attach(engine);
		const before = useSyncStore.getState().revision;

		// Coffre verrouillé, session expirée, protocole incompatible : le cycle
		// n'a rien appliqué, recharger les vues serait du bruit.
		for (const dead of [
			"locked",
			"reauth-required",
			"protocol-mismatch",
		] as const) {
			emit("syncing");
			emit(dead);
		}
		expect(useSyncStore.getState().revision).toBe(before);
	});

	it("garde un compteur monotone à travers detach", () => {
		const { engine, emit } = fakeEngine("idle");
		useSyncStore.getState().attach(engine);
		emit("syncing");
		emit("idle");
		const afterCycle = useSyncStore.getState().revision;

		// Volontairement pas remis à zéro : la déconnexion ne touche pas aux
		// données locales, donc rien à recharger — et un compteur qui recule
		// ferait recharger les vues pour rien à la reconnexion suivante.
		useSyncStore.getState().detach();
		expect(useSyncStore.getState().revision).toBe(afterCycle);
	});
});
