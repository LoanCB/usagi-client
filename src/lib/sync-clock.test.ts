import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getClockOffsetMs,
	nowIso,
	nowMs,
	setClockOffsetMs,
} from "./sync-clock";

describe("sync-clock", () => {
	afterEach(() => {
		setClockOffsetMs(0);
		vi.useRealTimers();
	});

	it("returns the real clock when no offset is set", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		expect(nowIso()).toBe("2026-08-25T10:00:00.000Z");
		expect(getClockOffsetMs()).toBe(0);
	});

	it("applies the server offset to every reading", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		setClockOffsetMs(90_000);
		expect(nowIso()).toBe("2026-08-25T10:01:30.000Z");
		vi.advanceTimersByTime(1_000);
		expect(nowMs()).toBe(Date.parse("2026-08-25T10:01:31.000Z"));
	});

	it("accepts a negative offset (device clock ahead of the server)", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		setClockOffsetMs(-3_600_000);
		expect(nowIso()).toBe("2026-08-25T09:00:00.000Z");
	});

	it("never goes backwards when a sync lowers the offset by a few ms", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T12:00:00.000Z") });
		const before = nowMs();
		// The next cycle measured the server a little lower: jitter, not a
		// correction. A write made now must still come after the last one.
		setClockOffsetMs(-50);
		expect(nowMs()).toBeGreaterThan(before);
	});

	it("strictly increases within one millisecond", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T13:00:00.000Z") });
		const first = nowMs();
		expect(nowMs()).toBeGreaterThan(first);
	});

	it("still applies a large correction at once (§5.1)", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T14:00:00.000Z") });
		nowMs();
		setClockOffsetMs(-3_600_000);
		expect(nowIso()).toBe("2026-08-25T13:00:00.000Z");
	});
});
