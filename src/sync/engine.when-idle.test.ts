// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SyncEngine } from "./engine";
import type { RecordCipher, ServerInfo, SyncTransport } from "./types";

function gate() {
	let release!: (unlocked: boolean) => void;
	const promise = new Promise<boolean>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

/** Nothing past isUnlocked is reached: releasing the gate with `false` ends the
 * cycle on "locked" without a database, a transport or a network. */
function makeEngine(isUnlocked: () => Promise<boolean>) {
	return new SyncEngine({
		db: {} as never,
		transport: {} as unknown as SyncTransport,
		cipher: {} as unknown as RecordCipher,
		getServerInfo: vi.fn(async () => ({}) as ServerInfo),
		isUnlocked,
	});
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SyncEngine.whenIdle", () => {
	it("résout immédiatement quand aucun cycle ne tourne", async () => {
		await expect(
			makeEngine(async () => false).whenIdle(),
		).resolves.toBeUndefined();
	});

	it("ne résout pas tant qu'un cycle est en vol", async () => {
		const g = gate();
		const engine = makeEngine(() => g.promise);
		void engine.syncNow();

		let idle = false;
		const waiting = engine.whenIdle().then(() => {
			idle = true;
		});
		await tick();
		expect(idle).toBe(false);

		g.release(false);
		await waiting;
		expect(idle).toBe(true);
	});

	it("attend aussi le cycle réenchaîné par la coalescence", async () => {
		const gates = [gate(), gate()];
		let call = 0;
		const engine = makeEngine(() => gates[call++].promise);

		void engine.syncNow();
		await tick();
		// Single-flight: this one does not start a cycle, it requests a rerun.
		void engine.syncNow();

		let idle = false;
		const waiting = engine.whenIdle().then(() => {
			idle = true;
		});
		gates[0].release(false);
		await tick();
		// The rerun is now the cycle that would write after a sign-out wipe, so
		// whenIdle must follow the chain rather than stop at the first handle.
		expect(idle).toBe(false);
		expect(call).toBe(2);

		gates[1].release(false);
		await waiting;
		expect(idle).toBe(true);
	});
});
