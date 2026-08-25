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
		expect(nowMs()).toBe(Date.parse("2026-08-25T10:01:30.000Z"));
	});

	it("accepts a negative offset (device clock ahead of the server)", () => {
		vi.useFakeTimers({ now: new Date("2026-08-25T10:00:00.000Z") });
		setClockOffsetMs(-3_600_000);
		expect(nowIso()).toBe("2026-08-25T09:00:00.000Z");
	});
});
