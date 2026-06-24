import { type InvokeArgs, invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdater } from "./useUpdater";

vi.mock("@tauri-apps/api/core", () => {
	// Minimal Channel stand-in: records the latest onmessage so install tests
	// can drive progress events through it.
	class Channel<T> {
		onmessage: ((message: T) => void) | null = null;
	}
	return { invoke: vi.fn(), Channel };
});

vi.mock("@tauri-apps/plugin-process", () => ({
	relaunch: vi.fn(),
}));

// Disable dev-mode guard so tests actually run the check
vi.stubEnv("MODE", "production");

const mockInvoke = vi.mocked(invoke);
const mockRelaunch = vi.mocked(relaunch);

interface UpdateInfo {
	version: string;
	current_version: string;
	notes: string | null;
}

function info(version: string): UpdateInfo {
	return { version, current_version: "0.1.0", notes: null };
}

/** Route check_update results per endpoint, given to mockInvoke. */
function checkResolver(map: {
	beta?: UpdateInfo | null;
	stable?: UpdateInfo | null;
}) {
	return (cmd: string, args?: InvokeArgs) => {
		if (cmd !== "check_update") return Promise.resolve(undefined);
		const endpoints =
			((args as Record<string, unknown>)?.endpoints as string[]) ?? [];
		const isBeta = endpoints.some((e) => e.includes("latest-beta"));
		return Promise.resolve((isBeta ? map.beta : map.stable) ?? null);
	};
}

describe("useUpdater", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("starts with idle status", () => {
		const { result } = renderHook(() => useUpdater());
		expect(result.current.status).toBe("idle");
		expect(result.current.available).toBeNull();
		expect(result.current.progress).toBe(0);
	});

	it("prioritizes beta over stable when both have an update", async () => {
		mockInvoke.mockImplementation(
			checkResolver({ beta: info("2026.1.1-beta9"), stable: info("26.2.0") }),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(true);
		});
		expect(result.current.status).toBe("available");
		expect(result.current.available).toEqual({
			version: "2026.1.1-beta9",
			isBeta: true,
		});
	});

	it("falls back to stable when beta has no update", async () => {
		mockInvoke.mockImplementation(
			checkResolver({ beta: null, stable: info("26.2.0") }),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(true);
		});
		expect(result.current.available).toEqual({
			version: "26.2.0",
			isBeta: false,
		});
	});

	it("checks only the stable channel when beta is disabled", async () => {
		mockInvoke.mockImplementation(checkResolver({ stable: info("26.2.0") }));
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(false);
		});
		expect(result.current.available).toEqual({
			version: "26.2.0",
			isBeta: false,
		});
		// Only the stable endpoint should have been queried.
		const calledEndpoints = mockInvoke.mock.calls
			.filter(([cmd]) => cmd === "check_update")
			.flatMap(
				([, args]) =>
					((args as Record<string, unknown>)?.endpoints as string[]) ?? [],
			);
		expect(calledEndpoints.some((e) => e.includes("latest-beta"))).toBe(false);
	});

	it("returns to idle when no update is found", async () => {
		mockInvoke.mockImplementation(checkResolver({ beta: null, stable: null }));
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(true);
		});
		expect(result.current.status).toBe("idle");
		expect(result.current.available).toBeNull();
	});

	it("sets status to error when check throws", async () => {
		mockInvoke.mockRejectedValue(new Error("Network error"));
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(false);
		});
		expect(result.current.status).toBe("error");
		expect(result.current.error).toBe("Network error");
	});

	it("dismiss resets status, available and progress to idle", async () => {
		mockInvoke.mockImplementation(checkResolver({ stable: info("26.2.0") }));
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(false);
		});
		expect(result.current.status).toBe("available");
		act(() => {
			result.current.dismiss();
		});
		expect(result.current.status).toBe("idle");
		expect(result.current.available).toBeNull();
		expect(result.current.progress).toBe(0);
	});

	it("streams progress and reaches ready after install finishes", async () => {
		mockInvoke.mockImplementation(checkResolver({ stable: info("26.2.0") }));
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(false);
		});

		// install_update: drive progress through the Channel passed to invoke.
		// These payloads MUST mirror the exact serde wire format of the Rust
		// `DownloadEvent` enum (PascalCase `event` tag, camelCased `data`
		// fields) — a mismatch here is what let the "stuck at 0%" bug slip
		// through. Verified against serde_json output.
		mockInvoke.mockImplementation((cmd: string, args?: InvokeArgs) => {
			if (cmd !== "install_update") return Promise.resolve(undefined);
			const ch = (args as Record<string, unknown>)?.onEvent as {
				onmessage: ((m: unknown) => void) | null;
			};
			ch.onmessage?.({ event: "Started", data: { contentLength: 1000 } });
			ch.onmessage?.({ event: "Progress", data: { chunkLength: 500 } });
			ch.onmessage?.({ event: "Finished" });
			return Promise.resolve(undefined);
		});

		await act(async () => {
			await result.current.downloadAndInstall();
		});
		expect(result.current.status).toBe("ready");
		expect(result.current.progress).toBe(100);
	});

	it("sets status to error when install throws", async () => {
		mockInvoke.mockImplementation(checkResolver({ stable: info("26.2.0") }));
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate(false);
		});
		mockInvoke.mockImplementation((cmd: string) => {
			if (cmd === "install_update")
				return Promise.reject(new Error("Download failed"));
			return Promise.resolve(undefined);
		});
		await act(async () => {
			await result.current.downloadAndInstall();
		});
		expect(result.current.status).toBe("error");
	});

	it("calls relaunch on relaunchApp", async () => {
		mockRelaunch.mockResolvedValue(undefined);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.relaunchApp();
		});
		expect(mockRelaunch).toHaveBeenCalledOnce();
	});
});
