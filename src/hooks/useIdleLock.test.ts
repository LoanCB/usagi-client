import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleLock } from "./useIdleLock";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useIdleLock", () => {
	it("fires after the idle delay", () => {
		const onIdle = vi.fn();
		renderHook(() => useIdleLock(5, onIdle));
		act(() => vi.advanceTimersByTime(5 * 60_000 - 1));
		expect(onIdle).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(1));
		expect(onIdle).toHaveBeenCalledTimes(1);
	});

	it("restarts the delay on activity", () => {
		const onIdle = vi.fn();
		renderHook(() => useIdleLock(1, onIdle));
		act(() => vi.advanceTimersByTime(50_000));
		fireEvent.keyDown(window);
		act(() => vi.advanceTimersByTime(50_000));
		expect(onIdle).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(10_000));
		expect(onIdle).toHaveBeenCalledTimes(1);
	});

	it("never fires when disabled", () => {
		const onIdle = vi.fn();
		renderHook(() => useIdleLock(0, onIdle));
		act(() => vi.advanceTimersByTime(24 * 3_600_000));
		expect(onIdle).not.toHaveBeenCalled();
	});
});
