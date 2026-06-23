import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import {
	check,
	type DownloadEvent,
	type Update,
} from "@tauri-apps/plugin-updater";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdater } from "./useUpdater";

vi.mock("@tauri-apps/plugin-updater", () => ({
	check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
	relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn(),
}));

// Disable dev-mode guard so tests actually run the check
vi.stubEnv("MODE", "production");

const mockCheck = vi.mocked(check);
const mockRelaunch = vi.mocked(relaunch);
const mockGetVersion = vi.mocked(getVersion);

function makeMockUpdate(version = "2.0.0") {
	return {
		version,
		body: "New features",
		downloadAndInstall: vi.fn(),
	};
}

describe("useUpdater", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("starts with idle status", () => {
		const { result } = renderHook(() => useUpdater());
		expect(result.current.status).toBe("idle");
		expect(result.current.update).toBeNull();
		expect(result.current.progress).toBe(0);
	});

	it("sets status to available when update is found", async () => {
		const mockUpdate = makeMockUpdate();
		mockCheck.mockResolvedValue(mockUpdate as unknown as Update);

		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate();
		});

		expect(result.current.status).toBe("available");
		expect(result.current.update).toBe(mockUpdate);
	});

	it("returns to idle when no update found", async () => {
		mockCheck.mockResolvedValue(null);

		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate();
		});

		expect(result.current.status).toBe("idle");
		expect(result.current.update).toBeNull();
	});

	it("sets status to error when check throws", async () => {
		mockCheck.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate();
		});

		expect(result.current.status).toBe("error");
	});

	it("dismiss resets status, update and progress to idle", async () => {
		mockCheck.mockResolvedValue(makeMockUpdate() as unknown as Update);

		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate();
		});
		expect(result.current.status).toBe("available");
		expect(result.current.update).not.toBeNull();

		act(() => {
			result.current.dismiss();
		});
		expect(result.current.status).toBe("idle");
		expect(result.current.update).toBeNull();
		expect(result.current.progress).toBe(0);
	});

	it("sets status to ready after downloadAndInstall finishes", async () => {
		const mockUpdate = makeMockUpdate();
		mockUpdate.downloadAndInstall.mockImplementation(
			async (onEvent: (progress: DownloadEvent) => void) => {
				onEvent({ event: "Started", data: { contentLength: 1000 } });
				onEvent({ event: "Progress", data: { chunkLength: 500 } });
				onEvent({ event: "Finished" });
			},
		);
		mockCheck.mockResolvedValue(mockUpdate as unknown as Update);

		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate();
		});
		await act(async () => {
			await result.current.downloadAndInstall();
		});

		expect(result.current.status).toBe("ready");
		expect(result.current.progress).toBe(100);
	});

	it("sets status to error when downloadAndInstall throws", async () => {
		const mockUpdate = makeMockUpdate();
		mockUpdate.downloadAndInstall.mockRejectedValue(
			new Error("Download failed"),
		);
		mockCheck.mockResolvedValue(mockUpdate as unknown as Update);

		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate();
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

	it("sets betaVersion and status available when beta manifest has a newer minor version", async () => {
		mockGetVersion.mockResolvedValue("1.0.0");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: "1.1.0-beta1" }),
			}),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate("beta");
		});
		expect(result.current.betaVersion).toBe("1.1.0-beta1");
		expect(result.current.status).toBe("available");
		expect(mockCheck).not.toHaveBeenCalled();
	});

	it("detects beta3 as newer than beta1 of the same base version", async () => {
		vi.stubEnv("VITE_APP_GIT_TAG", "v2026.1.1-beta1");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: "2026.1.1-beta3" }),
			}),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate("beta");
		});
		expect(result.current.betaVersion).toBe("2026.1.1-beta3");
		expect(result.current.status).toBe("available");
	});

	it("sets status idle when beta manifest version matches current beta version", async () => {
		vi.stubEnv("VITE_APP_GIT_TAG", "v2026.1.1-beta3");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: "2026.1.1-beta3" }),
			}),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate("beta");
		});
		expect(result.current.betaVersion).toBeNull();
		expect(result.current.status).toBe("idle");
	});

	it("sets status idle when beta manifest version matches current version", async () => {
		mockGetVersion.mockResolvedValue("1.0.0");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: "1.0.0" }),
			}),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate("beta");
		});
		expect(result.current.betaVersion).toBeNull();
		expect(result.current.status).toBe("idle");
	});

	it("sets status idle when beta endpoint returns 404 (no beta published yet)", async () => {
		mockGetVersion.mockResolvedValue("1.0.0");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 404 }),
		);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate("beta");
		});
		expect(result.current.betaVersion).toBeNull();
		expect(result.current.status).toBe("idle");
		expect(result.current.error).toBeNull();
	});

	it("calls check with no options when channel is stable", async () => {
		mockCheck.mockResolvedValue(null);
		const { result } = renderHook(() => useUpdater());
		await act(async () => {
			await result.current.checkForUpdate("stable");
		});
		expect(mockCheck).toHaveBeenCalledWith();
	});
});
