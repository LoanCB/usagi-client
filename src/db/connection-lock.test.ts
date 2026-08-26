import { describe, expect, it } from "vitest";
import { ConnectionLock } from "./connection-lock";

/** Let every already-queued microtask run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ConnectionLock", () => {
	it("lets shared holders run concurrently", async () => {
		const lock = new ConnectionLock();
		const first = await lock.acquire("shared");
		let secondGranted = false;
		void lock.acquire("shared").then(() => {
			secondGranted = true;
		});
		await settle();
		expect(secondGranted).toBe(true);
		first();
	});

	it("holds an exclusive waiter back until the readers leave", async () => {
		const lock = new ConnectionLock();
		const reader = await lock.acquire("shared");
		let granted = false;
		void lock.acquire("exclusive").then(() => {
			granted = true;
		});
		await settle();
		expect(granted).toBe(false);
		reader();
		await settle();
		expect(granted).toBe(true);
	});

	it("holds everything back while an exclusive holder runs", async () => {
		const lock = new ConnectionLock();
		const writer = await lock.acquire("exclusive");
		let granted = false;
		void lock.acquire("shared").then(() => {
			granted = true;
		});
		await settle();
		expect(granted).toBe(false);
		writer();
		await settle();
		expect(granted).toBe(true);
	});

	it("grants in arrival order, so reads cannot starve a queued write", async () => {
		const lock = new ConnectionLock();
		const held = await lock.acquire("shared");
		const order: string[] = [];
		void lock.acquire("exclusive").then((release) => {
			order.push("write");
			release();
		});
		void lock.acquire("shared").then((release) => {
			order.push("read");
			release();
		});
		held();
		await settle();
		expect(order).toEqual(["write", "read"]);
	});

	it("ignores a repeated release instead of freeing someone else's turn", async () => {
		const lock = new ConnectionLock();
		const stale = await lock.acquire("exclusive");
		stale();
		const writer = await lock.acquire("exclusive");
		stale();
		let granted = false;
		void lock.acquire("exclusive").then(() => {
			granted = true;
		});
		await settle();
		expect(granted).toBe(false);
		writer();
		await settle();
		expect(granted).toBe(true);
	});
});
