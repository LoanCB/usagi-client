# Beta Release Channel — Design Spec

**Date:** 2026-06-17  
**Status:** Approved

## Summary

Add an opt-in beta update channel so users can receive pre-release builds. Beta releases must not trigger automatic updates for users on the stable channel. A "Use beta versions" switch in Settings activates the beta channel immediately and on subsequent periodic checks.

---

## 1. CI/CD — Workflow changes (`release.yml`)

### Tag conventions
- Stable: `v1.0.0`, `v2026.1.0` (no pre-release suffix)
- Beta: `v1.0.0-beta`, `v1.0.0-beta.1`, etc.

### `create-updater-manifest` job

The job currently always generates `latest.json`. It must be split by tag type:

- **Stable tag** → generate and upload `latest.json` (unchanged behaviour)
- **Beta tag** → generate and upload `latest-beta.json` instead; never produce `latest.json`

Detection: `if [[ "$TAG" == *"-beta"* ]]` (mirrors the existing prerelease detection in the `release` job).

The generated manifest structure is identical; only the filename differs.

### `release` job

No change needed. The prerelease flag logic already handles beta tags correctly.

---

## 2. Settings store (`src/store/settings.ts`)

Add `betaChannel: boolean` to `SettingsStore`.

- **DB key:** `beta_channel`
- **Default:** `false`
- **Persistence pattern:** identical to `colorblindMode` — stored as `"true"` / `"false"` string, loaded with `=== "true"`

New interface members:
```ts
betaChannel: boolean;
setBetaChannel(repo: TodoRepository, enabled: boolean): Promise<void>;
```

`loadSettings` reads `raw.beta_channel === "true"` and sets `betaChannel`.

---

## 3. `useUpdater` hook (`src/hooks/useUpdater.ts`)

### Endpoint constants

```ts
const STABLE_ENDPOINT = undefined; // uses tauri.conf.json endpoint
const BETA_ENDPOINT =
  "https://github.com/LoanCB/usagi-client/releases/latest/download/latest-beta.json";
```

### `checkForUpdate` signature change

```ts
checkForUpdate: (channel?: "stable" | "beta") => Promise<void>;
```

When `channel === "beta"`, call `check({ url: BETA_ENDPOINT })`.  
Otherwise call `check()` (no options — uses the configured endpoint from `tauri.conf.json`).

The `UpdaterState` interface is updated accordingly.

---

## 4. SettingsDialog (`src/components/layout/SettingsDialog.tsx`)

In the existing "Mises à jour" section, add a `Switch` row:

- **Label:** i18n key `settings.betaChannel` (`"Utiliser les versions bêta"` / `"Use beta versions"`)
- **Warning:** shown below the switch **only when enabled** — i18n key `settings.betaChannelWarning`  
  Text: `"Les versions bêta peuvent contenir des bugs. Elles ne sont pas recommandées pour une utilisation quotidienne."` / `"Beta versions may contain bugs and are not recommended for daily use."`  
  Style: amber warning — same visual treatment as other destructive/warning notices in the dialog.

### On activation (`true`)
1. Persist via `setBetaChannel(repo, true)`
2. Immediately call `checkForUpdate("beta")`

### On deactivation (`false`)
1. Persist via `setBetaChannel(repo, false)`
2. No immediate check — silently revert to stable channel

---

## 5. App-level check (`src/App.tsx`)

The startup `useEffect` that calls `checkForUpdate()` must pass the current channel:

```ts
const betaChannel = useSettingsStore((s) => s.betaChannel);

useEffect(() => {
  updater.checkForUpdate(betaChannel ? "beta" : "stable");
}, [updater.checkForUpdate, betaChannel]);
```

`betaChannel` is available after `loadSettings` resolves. Since `loadSettings` runs in the prior `useEffect` and Zustand state updates are synchronous, `betaChannel` will reflect the persisted value on the first meaningful render after load.

---

## 6. i18n

Add keys to both `src/i18n/locales/fr.ts` and `src/i18n/locales/en.ts`:

| Key | FR | EN |
|-----|----|----|
| `settings.betaChannel` | `Utiliser les versions bêta` | `Use beta versions` |
| `settings.betaChannelWarning` | `Les versions bêta peuvent contenir des bugs. Elles ne sont pas recommandées pour une utilisation quotidienne.` | `Beta versions may contain bugs and are not recommended for daily use.` |

---

## 7. Tests

- **`settings.test.ts`**: add cases for `betaChannel` — default `false`, restored from `"true"`, defaults to `false` when absent
- **`useUpdater.test.ts`**: add cases verifying `check({ url: BETA_ENDPOINT })` is called when `channel === "beta"`, and `check()` (no args) when stable

---

## Out of scope

- In-app beta release notes display
- Automatic downgrade from beta to stable
- Server-side endpoint hosting (GitHub Releases is the CDN)
