import { act, renderHook } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useUpdater } from "./useUpdater";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

// Disable dev-mode guard so tests actually run the check
vi.stubEnv("MODE", "production");

const mockCheck = vi.mocked(check);
const mockRelaunch = vi.mocked(relaunch);

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
    mockCheck.mockResolvedValue(mockUpdate as any);

    const { result } = renderHook(() => useUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.status).toBe("available");
    expect(result.current.update).toBe(mockUpdate);
  });

  it("stays idle when no update found", async () => {
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
    mockCheck.mockResolvedValue(makeMockUpdate() as any);

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
    mockUpdate.downloadAndInstall.mockImplementation(async (onEvent: any) => {
      onEvent({ event: "Started", data: { contentLength: 1000 } });
      onEvent({ event: "Progress", data: { chunkLength: 500 } });
      onEvent({ event: "Finished", data: {} });
    });
    mockCheck.mockResolvedValue(mockUpdate as any);

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
    mockUpdate.downloadAndInstall.mockRejectedValue(new Error("Download failed"));
    mockCheck.mockResolvedValue(mockUpdate as any);

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
});
