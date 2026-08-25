import { describe, expect, it } from "vitest";
import {
	BACKOFF_BASE_MS,
	BACKOFF_CAP_MS,
	GATE_CAPACITY,
	RequestGate,
} from "./backoff";

/** Deterministic clock + sleep log: no real timers anywhere. */
function harness() {
	let now = 0;
	const sleeps: number[] = [];
	const gate = new RequestGate({
		now: () => now,
		sleep: async (ms) => {
			sleeps.push(ms);
			now += ms;
		},
	});
	return { gate, sleeps, advance: (ms: number) => (now += ms) };
}

describe("RequestGate pacing (token bucket 18/min)", () => {
	it("lets a burst of 18 through without waiting", async () => {
		const { gate, sleeps } = harness();
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		expect(sleeps).toEqual([]);
	});

	it("makes the 19th request wait for a refill", async () => {
		const { gate, sleeps } = harness();
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		await gate.beforeRequest();
		expect(sleeps.length).toBeGreaterThan(0);
		expect(sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
	});

	it("refills with time: after a full window the burst is available again", async () => {
		const { gate, sleeps, advance } = harness();
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		advance(60_000);
		for (let i = 0; i < GATE_CAPACITY; i++) await gate.beforeRequest();
		expect(sleeps).toEqual([]);
	});
});

describe("RequestGate backoff on 429", () => {
	it("sleeps 5, 10, 20, 40 then caps at 60 seconds", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		await gate.on429(null);
		expect(sleeps).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
		expect(BACKOFF_BASE_MS).toBe(5_000);
		expect(BACKOFF_CAP_MS).toBe(60_000);
	});

	it("honors Retry-After when the server provides it", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(7_000);
		expect(sleeps).toEqual([7_000]);
	});

	it("clamps a hostile or misconfigured Retry-After to the cap", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(999_999);
		expect(sleeps).toEqual([60_000]);
	});

	it("resets the ladder after a success", async () => {
		const { gate, sleeps } = harness();
		await gate.on429(null);
		gate.onSuccess();
		await gate.on429(null);
		expect(sleeps).toEqual([5_000, 5_000]);
	});
});
