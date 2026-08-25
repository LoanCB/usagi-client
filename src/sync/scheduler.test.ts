import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SYNC_INTERVAL_MS,
	SyncScheduler,
	WRITE_DEBOUNCE_MS,
} from "./scheduler";

let syncNow: ReturnType<typeof vi.fn>;
let scheduler: SyncScheduler;

beforeEach(() => {
	vi.useFakeTimers();
	syncNow = vi.fn(async () => undefined);
	scheduler = new SyncScheduler(
		{ syncNow: syncNow as unknown as () => Promise<void> },
		{ windowTarget: null },
	);
});
afterEach(() => {
	scheduler.stop();
	vi.useRealTimers();
});

describe("SyncScheduler (§4.2 triggers)", () => {
	it("syncs immediately on start", () => {
		scheduler.start();
		expect(syncNow).toHaveBeenCalledTimes(1);
	});

	it("syncs every 5 minutes", () => {
		scheduler.start();
		vi.advanceTimersByTime(SYNC_INTERVAL_MS * 2);
		expect(syncNow).toHaveBeenCalledTimes(3); // start + 2 intervals
	});

	it("debounces local writes: a burst collapses to one sync, 2s after the last", () => {
		scheduler.start();
		syncNow.mockClear();
		scheduler.notifyLocalWrite();
		vi.advanceTimersByTime(1_000);
		scheduler.notifyLocalWrite();
		vi.advanceTimersByTime(1_000);
		scheduler.notifyLocalWrite();
		expect(syncNow).not.toHaveBeenCalled();
		vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
		expect(syncNow).toHaveBeenCalledTimes(1);
	});

	it("syncs when the window regains focus", () => {
		const listeners = new Map<string, EventListener>();
		const fakeWindow = {
			addEventListener: (type: string, l: EventListener) =>
				listeners.set(type, l),
			removeEventListener: (type: string) => listeners.delete(type),
		} as unknown as Window;
		const focused = new SyncScheduler(
			{ syncNow: syncNow as unknown as () => Promise<void> },
			{ windowTarget: fakeWindow },
		);
		focused.start();
		syncNow.mockClear();
		listeners.get("focus")?.(new Event("focus"));
		expect(syncNow).toHaveBeenCalledTimes(1);
		focused.stop();
		expect(listeners.has("focus")).toBe(false);
	});

	it("stop() silences every trigger", () => {
		scheduler.start();
		scheduler.notifyLocalWrite();
		scheduler.stop();
		syncNow.mockClear();
		vi.advanceTimersByTime(SYNC_INTERVAL_MS * 3);
		expect(syncNow).not.toHaveBeenCalled();
	});
});
