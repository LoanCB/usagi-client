# Auto-update in-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app update detection, download, and installation via `tauri-plugin-updater`, with a bottom banner and a check button in SettingsDialog.

**Architecture:** The `useUpdater` hook manages update state and exposes it via a React context (`UpdaterContext`). `AppContent` provides the context and renders `<UpdateBanner />`. `SettingsDialog` consumes the context to offer a manual check button. The GitHub Action generates a signed `latest.json` manifest at release time.

**Tech Stack:** `tauri-plugin-updater` v2, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, Vitest + `@testing-library/react`, GitHub Actions

---

## Pre-task: Generate signing key pair (one-time, developer step)

This must be done **before** running the build workflow. Keys are never committed.

- [ ] Run in terminal:
  ```bash
  pnpm tauri signer generate -w ~/.tauri/bunly.key
  ```
  Output will show:
  ```
  Public key: dW50cnVzdGVkIGNvbW1lbnQ6...
  Private key written to ~/.tauri/bunly.key
  Public key written to ~/.tauri/bunly.key.pub
  ```
- [ ] Copy the **public key** (one-line string starting with `dW50...`) — you'll paste it into `tauri.conf.json` in Task 1.
- [ ] In GitHub → repo Settings → Secrets and variables → Actions, add:
  - `TAURI_SIGNING_PRIVATE_KEY` = content of `~/.tauri/bunly.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password you entered (or empty if none)

---

## File Map

| Action | Path                                          |
| ------ | --------------------------------------------- |
| Modify | `src-tauri/Cargo.toml`                        |
| Modify | `src-tauri/tauri.conf.json`                   |
| Modify | `src-tauri/src/lib.rs`                        |
| Modify | `src-tauri/capabilities/default.json`         |
| Create | `src/hooks/useUpdater.ts`                     |
| Create | `src/hooks/useUpdater.test.ts`                |
| Create | `src/components/layout/UpdateBanner.tsx`      |
| Create | `src/components/layout/UpdateBanner.test.tsx` |
| Modify | `src/App.tsx`                                 |
| Modify | `src/components/layout/SettingsDialog.tsx`    |
| Modify | `package.json` (via pnpm)                     |
| Modify | `.github/workflows/release.yml`               |

---

## Task 1: Configure Tauri backend

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Rust dependency**

  In `src-tauri/Cargo.toml`, add to `[dependencies]`:

  ```toml
  tauri-plugin-updater = "2"
  ```

- [ ] **Step 2: Register plugin in lib.rs**

  In `src-tauri/src/lib.rs`, add the plugin line after `tauri_plugin_fs::init()`:

  ```rust
  .plugin(tauri_plugin_updater::Builder::new().build())
  ```

  Full `run()` function after change:

  ```rust
  pub fn run() {
      tauri::Builder::default()
          .plugin(tauri_plugin_opener::init())
          .plugin(tauri_plugin_notification::init())
          .plugin(tauri_plugin_dialog::init())
          .plugin(tauri_plugin_fs::init())
          .plugin(tauri_plugin_updater::Builder::new().build())
          .plugin(tauri_plugin_sql::Builder::new().build())
          .invoke_handler(tauri::generate_handler![send_app_notification])
          .run(tauri::generate_context!())
          .expect("error while running tauri application");
  }
  ```

- [ ] **Step 3: Update tauri.conf.json**

  Replace the public key placeholder with the actual key generated in the pre-task:

  ```json
  {
    "$schema": "https://schema.tauri.app/config/2",
    "productName": "Bunly",
    "version": "0.1.0",
    "identifier": "com.bunly.app",
    "build": {
      "beforeDevCommand": "pnpm dev",
      "devUrl": "http://localhost:1420",
      "beforeBuildCommand": "pnpm build",
      "frontendDist": "../dist"
    },
    "app": {
      "windows": [
        {
          "title": "Bunly",
          "width": 800,
          "height": 600
        }
      ],
      "security": {
        "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
      }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "createUpdaterArtifacts": true,
      "linux": {
        "deb": {
          "depends": ["libdbus-1-3", "libnotify4"]
        }
      },
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "resources": ["icons/128x128.png"]
    },
    "plugins": {
      "updater": {
        "pubkey": "REPLACE_WITH_PUBLIC_KEY_FROM_PRE_TASK",
        "endpoints": [
          "https://github.com/LoanCB/usagi-client/releases/latest/download/latest.json"
        ]
      }
    }
  }
  ```

- [ ] **Step 4: Add updater permission to capabilities**

  In `src-tauri/capabilities/default.json`, add `"updater:default"` to the permissions array:

  ```json
  {
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "default",
    "description": "Default capability",
    "windows": ["main"],
    "permissions": [
      "core:default",
      "sql:allow-execute",
      "sql:allow-select",
      "sql:allow-load",
      "sql:allow-close",
      "notification:default",
      "opener:default",
      "dialog:default",
      "updater:default",
      "fs:allow-read-text-file",
      "fs:allow-write-text-file",
      {
        "identifier": "fs:scope",
        "allow": [{ "path": "$HOME/**" }]
      }
    ]
  }
  ```

- [ ] **Step 5: Verify Rust compiles**

  ```bash
  cd src-tauri && cargo check
  ```

  Expected: no errors (warnings about unused imports are fine)

---

## Task 2: Install frontend packages

**Files:** `package.json` (modified by pnpm)

- [ ] **Step 1: Install packages**

  ```bash
  pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
  ```

---

## Task 3: useUpdater hook (TDD)

**Files:**

- Create: `src/hooks/useUpdater.test.ts`
- Create: `src/hooks/useUpdater.ts`

- [ ] **Step 1: Write the failing tests**

  Create `src/hooks/useUpdater.test.ts`:

  ```typescript
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
  vi.stubEnv("DEV", "false");

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

    it("dismiss resets status to idle", async () => {
      mockCheck.mockResolvedValue(makeMockUpdate() as any);

      const { result } = renderHook(() => useUpdater());
      await act(async () => {
        await result.current.checkForUpdate();
      });
      expect(result.current.status).toBe("available");

      act(() => {
        result.current.dismiss();
      });
      expect(result.current.status).toBe("idle");
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

    it("calls relaunch on relaunchApp", async () => {
      mockRelaunch.mockResolvedValue(undefined);
      const { result } = renderHook(() => useUpdater());
      await act(async () => {
        await result.current.relaunchApp();
      });
      expect(mockRelaunch).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm vitest run src/hooks/useUpdater.test.ts
  ```

  Expected: FAIL — `Cannot find module '@/hooks/useUpdater'`

- [ ] **Step 3: Implement useUpdater.ts**

  Create `src/hooks/useUpdater.ts`:

  ```typescript
  import { createContext, useCallback, useContext, useState } from "react";
  import { check, type Update } from "@tauri-apps/plugin-updater";
  import { relaunch } from "@tauri-apps/plugin-process";

  export type UpdateStatus =
    | "idle"
    | "available"
    | "downloading"
    | "ready"
    | "error";

  export interface UpdaterState {
    status: UpdateStatus;
    update: Update | null;
    progress: number;
    checkForUpdate: () => Promise<void>;
    downloadAndInstall: () => Promise<void>;
    dismiss: () => void;
    relaunchApp: () => Promise<void>;
  }

  export function useUpdater(): UpdaterState {
    const [status, setStatus] = useState<UpdateStatus>("idle");
    const [update, setUpdate] = useState<Update | null>(null);
    const [progress, setProgress] = useState(0);

    const checkForUpdate = useCallback(async () => {
      if (import.meta.env.DEV) return;
      try {
        const available = await check();
        if (available) {
          setUpdate(available);
          setStatus("available");
        }
      } catch {
        setStatus("error");
      }
    }, []);

    const downloadAndInstall = useCallback(async () => {
      if (!update) return;
      setStatus("downloading");
      setProgress(0);
      try {
        let received = 0;
        let total = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
          } else if (event.event === "Progress") {
            received += event.data.chunkLength;
            if (total > 0) setProgress(Math.round((received / total) * 100));
          } else if (event.event === "Finished") {
            setProgress(100);
            setStatus("ready");
          }
        });
      } catch {
        setStatus("error");
      }
    }, [update]);

    const dismiss = useCallback(() => setStatus("idle"), []);

    const relaunchApp = useCallback(async () => {
      await relaunch();
    }, []);

    return {
      status,
      update,
      progress,
      checkForUpdate,
      downloadAndInstall,
      dismiss,
      relaunchApp,
    };
  }

  export const UpdaterContext = createContext<UpdaterState | null>(null);

  export function useUpdaterContext(): UpdaterState {
    const ctx = useContext(UpdaterContext);
    if (!ctx)
      throw new Error(
        "useUpdaterContext must be used inside UpdaterContext.Provider",
      );
    return ctx;
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm vitest run src/hooks/useUpdater.test.ts
  ```

  Expected: all 7 tests PASS

---

## Task 4: UpdateBanner component (TDD)

**Files:**

- Create: `src/components/layout/UpdateBanner.test.tsx`
- Create: `src/components/layout/UpdateBanner.tsx`

- [ ] **Step 1: Write the failing tests**

  Create `src/components/layout/UpdateBanner.test.tsx`:

  ```typescript
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import "@/i18n";
  import { vi, describe, it, expect } from "vitest";
  import { UpdateBanner } from "./UpdateBanner";
  import { UpdaterContext } from "@/hooks/useUpdater";
  import type { UpdaterState } from "@/hooks/useUpdater";

  function makeState(overrides: Partial<UpdaterState> = {}): UpdaterState {
    return {
      status: "idle",
      update: null,
      progress: 0,
      checkForUpdate: vi.fn(),
      downloadAndInstall: vi.fn(),
      dismiss: vi.fn(),
      relaunchApp: vi.fn(),
      ...overrides,
    };
  }

  function renderBanner(state: UpdaterState) {
    return render(
      <UpdaterContext.Provider value={state}>
        <UpdateBanner />
      </UpdaterContext.Provider>
    );
  }

  describe("UpdateBanner", () => {
    it("renders nothing when status is idle", () => {
      const { container } = renderBanner(makeState());
      expect(container.firstChild).toBeNull();
    });

    it("shows version and buttons when update is available", () => {
      renderBanner(
        makeState({ status: "available", update: { version: "2.0.0" } as any })
      );
      expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /mettre à jour/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /plus tard/i })).toBeInTheDocument();
    });

    it("calls downloadAndInstall when update button clicked", async () => {
      const user = userEvent.setup();
      const state = makeState({
        status: "available",
        update: { version: "2.0.0" } as any,
      });
      renderBanner(state);
      await user.click(screen.getByRole("button", { name: /mettre à jour/i }));
      expect(state.downloadAndInstall).toHaveBeenCalledOnce();
    });

    it("calls dismiss when plus tard clicked", async () => {
      const user = userEvent.setup();
      const state = makeState({
        status: "available",
        update: { version: "2.0.0" } as any,
      });
      renderBanner(state);
      await user.click(screen.getByRole("button", { name: /plus tard/i }));
      expect(state.dismiss).toHaveBeenCalledOnce();
    });

    it("shows progress percentage during download", () => {
      renderBanner(
        makeState({ status: "downloading", update: { version: "2.0.0" } as any, progress: 67 })
      );
      expect(screen.getByText("67%")).toBeInTheDocument();
    });

    it("shows relaunch button when ready and calls relaunchApp on click", async () => {
      const user = userEvent.setup();
      const state = makeState({
        status: "ready",
        update: { version: "2.0.0" } as any,
        progress: 100,
      });
      renderBanner(state);
      const btn = screen.getByRole("button", { name: /redémarrer/i });
      expect(btn).toBeInTheDocument();
      await user.click(btn);
      expect(state.relaunchApp).toHaveBeenCalledOnce();
    });

    it("shows retry button on error and calls checkForUpdate on click", async () => {
      const user = userEvent.setup();
      const state = makeState({ status: "error", update: { version: "2.0.0" } as any });
      renderBanner(state);
      await user.click(screen.getByRole("button", { name: /réessayer/i }));
      expect(state.checkForUpdate).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm vitest run src/components/layout/UpdateBanner.test.tsx
  ```

  Expected: FAIL — `Cannot find module './UpdateBanner'`

- [ ] **Step 3: Implement UpdateBanner.tsx**

  Create `src/components/layout/UpdateBanner.tsx`:

  ```typescript
  import { ArrowUp, CheckCircle, Loader2 } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { useUpdaterContext } from "@/hooks/useUpdater";

  export function UpdateBanner() {
    const {
      status,
      update,
      progress,
      downloadAndInstall,
      dismiss,
      relaunchApp,
      checkForUpdate,
    } = useUpdaterContext();

    if (status === "idle" || !update) return null;

    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg min-w-80">
        {status === "available" && (
          <>
            <ArrowUp className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm flex-1">
              Bunly v{update.version} est disponible
            </span>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Plus tard
            </Button>
            <Button size="sm" onClick={downloadAndInstall}>
              Mettre à jour
            </Button>
          </>
        )}
        {status === "downloading" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span className="text-sm flex-1">Téléchargement...</span>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground w-10 text-right">
              {progress}%
            </span>
          </>
        )}
        {status === "ready" && (
          <>
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm flex-1">Mise à jour installée</span>
            <Button size="sm" onClick={relaunchApp}>
              Redémarrer maintenant
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <span className="text-sm flex-1 text-destructive">
              Échec de la mise à jour
            </span>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Fermer
            </Button>
            <Button size="sm" onClick={checkForUpdate}>
              Réessayer
            </Button>
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm vitest run src/components/layout/UpdateBanner.test.tsx
  ```

  Expected: all 7 tests PASS

---

## Task 5: Wire up in App.tsx

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

  At the top of `src/App.tsx`, add:

  ```typescript
  import { UpdateBanner } from "@/components/layout/UpdateBanner";
  import { UpdaterContext, useUpdater } from "@/hooks/useUpdater";
  ```

- [ ] **Step 2: Use the hook and provide context in AppContent**

  Replace the existing `AppContent` function with:

  ```typescript
  export function AppContent() {
    const loadTasks = useTaskStore((s) => s.loadTasks);
    const loadProjects = useProjectStore((s) => s.loadProjects);
    const loadTags = useTagStore((s) => s.loadTags);
    const loadSettings = useSettingsStore((s) => s.loadSettings);
    const loadShortcuts = useShortcutsStore((s) => s.loadShortcuts);
    const tasks = useTaskStore((s) => s.tasks);
    useOverdueNotifications(tasks);

    const updater = useUpdater();

    useEffect(() => {
      const repo = getRepository();
      async function load() {
        await loadSettings(repo);
        await loadShortcuts(repo);
        loadProjects(repo);
        loadTags(repo);
        loadTasks(repo, {});
      }
      load();
    }, [loadSettings, loadTasks, loadTags, loadShortcuts, loadProjects]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      updater.checkForUpdate();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <UpdaterContext.Provider value={updater}>
        <AppShell />
        <UpdateBanner />
      </UpdaterContext.Provider>
    );
  }
  ```

- [ ] **Step 3: Run full test suite**

  ```bash
  pnpm vitest run
  ```

  Expected: all tests PASS

---

## Task 6: Add update button in SettingsDialog

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

The update section goes in the `general` tab, at the bottom before the closing `</div>` of the tab panel. It shows the current app version and a "Vérifier les mises à jour" button.

- [ ] **Step 1: Add imports**

  Add to the existing imports at the top of `src/components/layout/SettingsDialog.tsx`:

  ```typescript
  import { getVersion } from "@tauri-apps/api/app";
  import { useUpdaterContext } from "@/hooks/useUpdater";
  ```

- [ ] **Step 2: Add state and handlers inside SettingsDialog**

  Inside the `SettingsDialog` function body, after the `const [activeTab, setActiveTab]` declaration (around line 392), add:

  ```typescript
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [upToDate, setUpToDate] = useState(false);
  const { checkForUpdate, status } = useUpdaterContext();

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => null);
  }, []);

  async function handleCheckForUpdate() {
    setUpToDate(false);
    await checkForUpdate();
    // If status is still idle after check, no update was found
    setUpToDate(true);
  }
  ```

- [ ] **Step 3: Add the version + check section in the general tab**

  Find the end of the `{activeTab === "general" && ...}` block (around line 740). Add this section as the last card inside the outer `div` of the general tab panel, just before the closing `</div>`:

  ```tsx
  <div className="rounded-lg border border-input p-4 flex items-center justify-between gap-4 mt-2">
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Application
      </p>
      {appVersion && (
        <p className="text-sm text-muted-foreground">v{appVersion}</p>
      )}
      {upToDate && status === "idle" && (
        <p className="text-xs text-green-600">Vous êtes à jour</p>
      )}
      {status === "available" && (
        <p className="text-xs text-primary">Une mise à jour est disponible</p>
      )}
    </div>
    <Button
      variant="outline"
      size="sm"
      onClick={handleCheckForUpdate}
      disabled={status === "downloading"}
    >
      Vérifier les mises à jour
    </Button>
  </div>
  ```

- [ ] **Step 4: Run the test suite**

  ```bash
  pnpm vitest run
  ```

  Expected: all tests PASS

  > Note: The existing `SidebarViewsSettings.test.tsx` mocks `@/store/repository` but not `@tauri-apps/api/app` or `@/hooks/useUpdater`. If tests fail because of missing mocks, add to the test file:
  >
  > ```typescript
  > vi.mock("@tauri-apps/api/app", () => ({
  >   getVersion: vi.fn().mockResolvedValue("1.0.0"),
  > }));
  > vi.mock("@/hooks/useUpdater", () => ({
  >   useUpdaterContext: () => ({
  >     status: "idle",
  >     checkForUpdate: vi.fn(),
  >   }),
  > }));
  > ```

---

## Task 7: GitHub Action — signing and manifest generation

**Files:**

- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Replace `.github/workflows/release.yml`**

  ```yaml
  name: Release

  on:
    push:
      tags:
        - "v*"

  permissions:
    contents: write

  jobs:
    build:
      strategy:
        fail-fast: false
        matrix:
          include:
            - os: macos-latest
              name: macOS-arm64
            - os: windows-latest
              name: Windows-x64
            - os: ubuntu-22.04
              name: Linux-x64

      runs-on: ${{ matrix.os }}

      env:
        TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      steps:
        - uses: actions/checkout@v4

        - name: Install Linux dependencies
          if: matrix.os == 'ubuntu-22.04'
          run: |
            sudo apt-get update
            sudo apt-get install -y \
              libwebkit2gtk-4.1-dev \
              libappindicator3-dev \
              librsvg2-dev \
              patchelf \
              libdbus-1-dev \
              libglib2.0-dev

        - uses: pnpm/action-setup@v4
          with:
            version: 10.12.1

        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: pnpm

        - uses: dtolnay/rust-toolchain@stable

        - uses: swatinem/rust-cache@v2
          with:
            workspaces: src-tauri

        - run: pnpm install --frozen-lockfile

        - name: Set version from git tag
          shell: bash
          env:
            TAG: ${{ github.ref_name }}
          run: |
            VERSION="${TAG#v}"
            jq --arg version "$VERSION" '.version = $version' src-tauri/tauri.conf.json > tmp.json
            mv tmp.json src-tauri/tauri.conf.json

        - name: Build Tauri app
          run: pnpm tauri build

        - name: Upload artifacts
          uses: actions/upload-artifact@v4
          with:
            name: bunly-${{ matrix.name }}
            path: |
              src-tauri/target/release/bundle/dmg/*.dmg
              src-tauri/target/release/bundle/macos/*.app.tar.gz
              src-tauri/target/release/bundle/macos/*.app.tar.gz.sig
              src-tauri/target/release/bundle/msi/*.msi
              src-tauri/target/release/bundle/msi/*.msi.zip
              src-tauri/target/release/bundle/msi/*.msi.zip.sig
              src-tauri/target/release/bundle/nsis/*.exe
              src-tauri/target/release/bundle/nsis/*.nsis.zip
              src-tauri/target/release/bundle/nsis/*.nsis.zip.sig
              src-tauri/target/release/bundle/deb/*.deb
              src-tauri/target/release/bundle/appimage/*.AppImage
              src-tauri/target/release/bundle/appimage/*.AppImage.tar.gz
              src-tauri/target/release/bundle/appimage/*.AppImage.tar.gz.sig
            if-no-files-found: warn

    create-updater-manifest:
      needs: build
      runs-on: ubuntu-latest

      steps:
        - name: Download all artifacts
          uses: actions/download-artifact@v4
          with:
            path: artifacts
            merge-multiple: true

        - name: List downloaded artifacts
          run: find artifacts -type f | sort

        - name: Generate latest.json
          env:
            TAG: ${{ github.ref_name }}
            GITHUB_REPO: LoanCB/usagi-client
          run: |
            VERSION="${TAG#v}"
            node << 'EOF'
            const fs = require('fs');
            const path = require('path');

            const tag = process.env.TAG;
            const version = process.env.TAG.replace(/^v/, '');
            const repo = process.env.GITHUB_REPO;
            const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;

            function walkDir(dir) {
              const results = [];
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) results.push(...walkDir(full));
                else results.push(full);
              }
              return results;
            }

            const allFiles = walkDir('artifacts');
            console.log('All files:', allFiles);

            function find(suffix) {
              return allFiles.find(f => f.endsWith(suffix)) ?? null;
            }

            function readSig(suffix) {
              const f = find(suffix);
              if (!f) throw new Error(`Missing signature: ${suffix}`);
              return fs.readFileSync(f, 'utf8').trim();
            }

            const manifest = {
              version,
              notes: '',
              pub_date: new Date().toISOString(),
              platforms: {},
            };

            const macTar = find('.app.tar.gz');
            if (macTar) {
              manifest.platforms['darwin-aarch64'] = {
                url: `${baseUrl}/${path.basename(macTar)}`,
                signature: readSig('.app.tar.gz.sig'),
              };
            }

            const linuxTar = find('.AppImage.tar.gz');
            if (linuxTar) {
              manifest.platforms['linux-x86_64'] = {
                url: `${baseUrl}/${path.basename(linuxTar)}`,
                signature: readSig('.AppImage.tar.gz.sig'),
              };
            }

            const winZip = find('.nsis.zip') ?? find('.msi.zip');
            if (winZip) {
              const sigSuffix = winZip.endsWith('.nsis.zip') ? '.nsis.zip.sig' : '.msi.zip.sig';
              manifest.platforms['windows-x86_64'] = {
                url: `${baseUrl}/${path.basename(winZip)}`,
                signature: readSig(sigSuffix),
              };
            }

            if (Object.keys(manifest.platforms).length === 0) {
              throw new Error('No platforms found in artifacts — check upload paths in build job');
            }

            fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
            console.log('Generated latest.json:\n' + JSON.stringify(manifest, null, 2));
            EOF

        - name: Upload updater manifest
          uses: actions/upload-artifact@v4
          with:
            name: updater-manifest
            path: latest.json
            if-no-files-found: error

    release:
      needs: [build, create-updater-manifest]
      runs-on: ubuntu-latest

      steps:
        - name: Download all artifacts
          uses: actions/download-artifact@v4
          with:
            path: artifacts
            merge-multiple: true

        - name: Determine release type
          id: release_type
          env:
            TAG: ${{ github.ref_name }}
          run: |
            if [[ "$TAG" == *"-beta"* ]]; then
              echo "prerelease=true" >> $GITHUB_OUTPUT
              echo "release_name=Pre-release $TAG (unstable)" >> $GITHUB_OUTPUT
            else
              echo "prerelease=false" >> $GITHUB_OUTPUT
              echo "release_name=Release $TAG" >> $GITHUB_OUTPUT
            fi

        - name: Create GitHub Release
          uses: softprops/action-gh-release@v2
          with:
            name: ${{ steps.release_type.outputs.release_name }}
            prerelease: ${{ steps.release_type.outputs.prerelease }}
            generate_release_notes: true
            files: artifacts/**/*
  ```

---

## Task 8: Full verification

- [ ] **Step 1: Run all tests**

  ```bash
  pnpm vitest run
  ```

  Expected: all tests PASS

- [ ] **Step 2: TypeScript check**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: no errors

- [ ] **Step 3: Rust check**
  ```bash
  cd src-tauri && cargo check
  ```
  Expected: no errors

---

## Post-implementation checklist

After merging and creating the first release tag with this code:

1. Verify the CI completes and `latest.json` appears as a release asset in GitHub
2. Check the `List downloaded artifacts` step output to confirm `.sig` filenames match the globs (adjust if needed)
3. Install the app, bump the version, push a second tag, confirm the banner appears on first launch
4. Test full flow: banner → "Mettre à jour" → progress → "Redémarrer maintenant"
