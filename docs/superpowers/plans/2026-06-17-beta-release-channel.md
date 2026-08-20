# Beta Release Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in beta update channel so beta tags publish `latest-beta.json` instead of `latest.json`, and users can enable the beta channel from Settings to receive pre-release builds.

**Architecture:** The CI workflow is split by tag type to produce the right manifest filename. The settings store gains a `betaChannel` boolean. `useUpdater.checkForUpdate` accepts an optional `channel` param and passes the beta URL to `check()` when enabled. The Settings dialog exposes a switch that persists the preference and immediately triggers a beta check on activation.

**Tech Stack:** GitHub Actions, Tauri 2 (`@tauri-apps/plugin-updater` v2), React, Zustand, i18next, Vitest

**Forbidden** Write git commands (only read commands are authorized)

## Global Constraints

- Beta tag pattern: any tag matching `*-beta*` (e.g. `v1.0.0-beta`, `v1.0.0-beta.1`)
- Stable tag pattern: `v*` without `-beta` in the name
- Beta endpoint URL (exact): `https://github.com/LoanCB/usagi-client/releases/latest/download/latest-beta.json`
- Stable endpoint: `undefined` — `check()` with no options uses `tauri.conf.json`
- DB key for beta channel setting: `beta_channel`
- i18n key prefix: `settings.betaChannel` and `settings.betaChannelWarning`
- All new tests follow existing patterns in `src/store/settings.test.ts` and `src/hooks/useUpdater.test.ts`

---

### Task 1: CI — Split manifest by tag type

**Files:**

- Modify: `.github/workflows/release.yml` — `create-updater-manifest` job and `release` job

**Interfaces:**

- Produces: `latest.json` for stable tags, `latest-beta.json` for beta tags — both uploaded as artifacts named `updater-manifest`

- [ ] **Step 1: Add tag-type detection to `create-updater-manifest` job**

In `.github/workflows/release.yml`, replace the `Generate latest.json` step with one that detects the tag type and sets the output filename. Add this step before the `node << 'EOF'` block:

```yaml
- name: Detect tag type
  id: tag_type
  env:
    TAG: ${{ github.ref_name }}
  run: |
    if [[ "$TAG" == *"-beta"* ]]; then
      echo "manifest_name=latest-beta.json" >> $GITHUB_OUTPUT
    else
      echo "manifest_name=latest.json" >> $GITHUB_OUTPUT
    fi
```

- [ ] **Step 2: Use the dynamic filename in the Node manifest generation**

In the same job, the `Generate latest.json` step writes to a hardcoded `latest.json`. Change the last line of the inline Node script from:

```js
fs.writeFileSync("latest.json", JSON.stringify(manifest, null, 2));
console.log("Generated latest.json:\n" + JSON.stringify(manifest, null, 2));
```

to:

```js
const manifestName = process.env.MANIFEST_NAME;
fs.writeFileSync(manifestName, JSON.stringify(manifest, null, 2));
console.log(`Generated ${manifestName}:\n` + JSON.stringify(manifest, null, 2));
```

And add the env var to the step:

```yaml
env:
  TAG: ${{ github.ref_name }}
  GITHUB_REPO: LoanCB/usagi-client
  MANIFEST_NAME: ${{ steps.tag_type.outputs.manifest_name }}
```

- [ ] **Step 3: Update the upload step to use the dynamic filename**

The `Upload updater manifest` step currently hardcodes `latest.json`. Change its `path` to:

```yaml
- name: Upload updater manifest
  uses: actions/upload-artifact@v4
  with:
    name: updater-manifest
    path: ${{ steps.tag_type.outputs.manifest_name }}
    if-no-files-found: error
```

- [ ] **Step 4: Verify the workflow file is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

---

### Task 2: Settings store — `betaChannel` setting

**Files:**

- Modify: `src/store/settings.ts`
- Test: `src/store/settings.test.ts`

**Interfaces:**

- Produces:
  - `betaChannel: boolean` on `SettingsStore` (default `false`)
  - `setBetaChannel(repo: TodoRepository, enabled: boolean): Promise<void>`
  - `loadSettings` reads `raw.beta_channel === "true"` and sets `betaChannel`

- [ ] **Step 1: Write the failing tests**

At the end of `src/store/settings.test.ts`, add a new `describe` block (after the existing `useSettingsStore colorblindMode` block):

```ts
describe("useSettingsStore betaChannel", () => {
  it("defaults betaChannel to false", () => {
    expect(useSettingsStore.getState().betaChannel).toBe(false);
  });

  it("setBetaChannel updates state and persists to DB", async () => {
    await useSettingsStore
      .getState()
      // biome-ignore lint/suspicious/noExplicitAny: partial mock
      .setBetaChannel(mockRepo as any, true);
    expect(useSettingsStore.getState().betaChannel).toBe(true);
    expect(mockRepo.setSetting).toHaveBeenCalledWith("beta_channel", "true");
  });

  it("loadSettings restores betaChannel from persisted value", async () => {
    mockRepo.getSettings.mockResolvedValueOnce({
      beta_channel: "true",
    });
    // biome-ignore lint/suspicious/noExplicitAny: partial mock
    await useSettingsStore.getState().loadSettings(mockRepo as any);
    expect(useSettingsStore.getState().betaChannel).toBe(true);
  });

  it("loadSettings defaults betaChannel to false when key is absent", async () => {
    mockRepo.getSettings.mockResolvedValueOnce({});
    // biome-ignore lint/suspicious/noExplicitAny: partial mock
    await useSettingsStore.getState().loadSettings(mockRepo as any);
    expect(useSettingsStore.getState().betaChannel).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: 4 new failures — `betaChannel is not a function` / property undefined

- [ ] **Step 3: Add `betaChannel` to the store**

In `src/store/settings.ts`:

1. Add to the `SettingsStore` interface (after `colorblindMode`):

```ts
	betaChannel: boolean;
	setBetaChannel(repo: TodoRepository, enabled: boolean): Promise<void>;
```

2. Add the default value in `create<SettingsStore>` (after `colorblindMode: false`):

```ts
	betaChannel: false,
```

3. In `loadSettings`, add after the `colorblindMode` line:

```ts
const betaChannel = raw.beta_channel === "true";
```

4. Add `betaChannel` to the `set({...})` call inside `loadSettings` (after `colorblindMode`):

```ts
			betaChannel,
```

5. Add the setter after `setColorblindMode`:

```ts
	async setBetaChannel(repo, enabled) {
		await repo.setSetting("beta_channel", String(enabled));
		set({ betaChannel: enabled });
	},
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: all tests pass

---

### Task 3: `useUpdater` — channel-aware `checkForUpdate`

**Files:**

- Modify: `src/hooks/useUpdater.ts`
- Test: `src/hooks/useUpdater.test.ts`

**Interfaces:**

- Consumes: `check` from `@tauri-apps/plugin-updater` (already imported)
- Produces:
  - `checkForUpdate: (channel?: "stable" | "beta") => Promise<void>` — replaces current `() => Promise<void>`
  - `BETA_ENDPOINT` constant (module-level, not exported)

- [ ] **Step 1: Write the failing tests**

In `src/hooks/useUpdater.test.ts`, add two new test cases inside the existing `describe("useUpdater", ...)` block, after the last existing `it(...)`:

```ts
it("calls check with beta URL when channel is beta", async () => {
  mockCheck.mockResolvedValue(null);
  const { result } = renderHook(() => useUpdater());
  await act(async () => {
    await result.current.checkForUpdate("beta");
  });
  expect(mockCheck).toHaveBeenCalledWith({
    url: "https://github.com/LoanCB/usagi-client/releases/latest/download/latest-beta.json",
  });
});

it("calls check with no options when channel is stable", async () => {
  mockCheck.mockResolvedValue(null);
  const { result } = renderHook(() => useUpdater());
  await act(async () => {
    await result.current.checkForUpdate("stable");
  });
  expect(mockCheck).toHaveBeenCalledWith();
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test:run src/hooks/useUpdater.test.ts
```

Expected: 2 new failures — `check` called without expected args

- [ ] **Step 3: Update `useUpdater.ts`**

In `src/hooks/useUpdater.ts`:

1. Add the constant after the imports:

```ts
const BETA_ENDPOINT =
  "https://github.com/LoanCB/usagi-client/releases/latest/download/latest-beta.json";
```

2. Update the `UpdaterState` interface — change `checkForUpdate` signature:

```ts
checkForUpdate: (channel?: "stable" | "beta") => Promise<void>;
```

3. Update the `checkForUpdate` callback to accept `channel` and call `check` accordingly:

```ts
const checkForUpdate = useCallback(async (channel?: "stable" | "beta") => {
  if (import.meta.env.MODE !== "production") return;
  setStatus("checking");
  setError(null);
  try {
    const available =
      channel === "beta" ? await check({ url: BETA_ENDPOINT }) : await check();
    if (available) {
      setUpdate(available);
      setStatus("available");
    } else {
      setStatus("idle");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updater] checkForUpdate failed:", message);
    setError(message);
    setStatus("error");
  }
}, []);
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm test:run src/hooks/useUpdater.test.ts
```

Expected: all tests pass

---

### Task 4: i18n — Add beta channel keys

**Files:**

- Modify: `src/i18n/locales/fr.ts`
- Modify: `src/i18n/locales/en.ts`

**Interfaces:**

- Produces:
  - `settings.betaChannel` — switch label
  - `settings.betaChannelWarning` — warning shown when enabled

- [ ] **Step 1: Add keys to `fr.ts`**

In `src/i18n/locales/fr.ts`, inside the `settings` object, add after `updateCheckError`:

```ts
		betaChannel: "Utiliser les versions bêta",
		betaChannelWarning:
			"Les versions bêta peuvent contenir des bugs. Elles ne sont pas recommandées pour une utilisation quotidienne.",
```

- [ ] **Step 2: Add keys to `en.ts`**

In `src/i18n/locales/en.ts`, inside the `settings` object, add after `updateCheckError`:

```ts
		betaChannel: "Use beta versions",
		betaChannelWarning:
			"Beta versions may contain bugs and are not recommended for daily use.",
```

- [ ] **Step 3: Verify the build compiles**

```bash
pnpm build
```

Expected: build succeeds with no TypeScript errors

---

### Task 5: SettingsDialog — Beta channel switch

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

**Interfaces:**

- Consumes:
  - `betaChannel: boolean` and `setBetaChannel(repo, enabled)` from `useSettingsStore` (Task 2)
  - `checkForUpdate(channel?: "stable" | "beta")` from `useUpdaterContext` (Task 3)
  - `settings.betaChannel` and `settings.betaChannelWarning` i18n keys (Task 4)

- [ ] **Step 1: Wire up the store selectors**

In `src/components/layout/SettingsDialog.tsx`, next to the existing `colorblindMode` lines (around line 369):

```ts
const betaChannel = useSettingsStore((s) => s.betaChannel);
const setBetaChannel = useSettingsStore((s) => s.setBetaChannel);
```

- [ ] **Step 2: Add `handleBetaChannelChange` handler**

After `handleCheckForUpdate` (around line 416), add:

```ts
async function handleBetaChannelChange(enabled: boolean) {
  await setBetaChannel(getRepository(), enabled);
  if (enabled) {
    await checkForUpdate("beta");
  }
}
```

- [ ] **Step 3: Add the switch to the "Application" section**

In the JSX, inside the `rounded-lg border border-input p-4` block that contains the update check button (around line 955), add the beta channel switch **before** the existing update-check button block. The full updated block becomes:

```tsx
<div className="rounded-lg border border-input p-4 flex flex-col gap-4">
  <div className="flex items-center justify-between gap-4">
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {t("settings.application")}
      </p>
      {appVersion && (
        <p className="text-sm text-muted-foreground">v{appVersion}</p>
      )}
      {hasChecked && status === "idle" && (
        <p className="text-xs text-green-600">{t("settings.upToDate")}</p>
      )}
      {hasChecked && status === "error" && !update && (
        <p className="text-xs text-destructive">
          {t("settings.updateCheckError")}
        </p>
      )}
      {status === "available" && (
        <p className="text-xs text-primary">{t("settings.updateAvailable")}</p>
      )}
    </div>
    <Button
      variant="outline"
      size="sm"
      onClick={handleCheckForUpdate}
      disabled={status === "downloading" || status === "checking"}
    >
      {status === "checking" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          {t("settings.checkingForUpdates")}
        </>
      ) : (
        t("settings.checkForUpdates")
      )}
    </Button>
  </div>

  <div className="h-px bg-border" />

  <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between cursor-pointer select-none">
      <span className="text-sm text-foreground">
        {t("settings.betaChannel")}
      </span>
      <Switch checked={betaChannel} onCheckedChange={handleBetaChannelChange} />
    </div>
    {betaChannel && (
      <p className="text-xs text-amber-600">
        {t("settings.betaChannelWarning")}
      </p>
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors

---

### Task 6: App.tsx — Pass channel to startup check

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes:
  - `betaChannel: boolean` from `useSettingsStore` (Task 2)
  - `checkForUpdate(channel?: "stable" | "beta")` from `useUpdater` (Task 3)

- [ ] **Step 1: Read the betaChannel value and pass it to `checkForUpdate`**

In `src/App.tsx`, add the `betaChannel` selector after the existing store selectors (after `loadSettings`):

```ts
const betaChannel = useSettingsStore((s) => s.betaChannel);
```

Then update the updater `useEffect` (currently around line 45) to pass the channel:

```ts
useEffect(() => {
  updater.checkForUpdate(betaChannel ? "beta" : "stable");
}, [updater.checkForUpdate, betaChannel]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors

- [ ] **Step 3: Run full test suite**

```bash
pnpm test:run
```

Expected: all tests pass
