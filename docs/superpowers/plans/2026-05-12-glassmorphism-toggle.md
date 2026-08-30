# Glassmorphism Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a glassmorphism opt-in toggle in Settings; default off (flat/solid UI), on restores current orbs + backdrop-filter look.

**Architecture:** A `glass` CSS class on `<html>` gates all glass-specific rules (same pattern as Tailwind's `dark` class). The `glassmorphismEnabled` boolean lives in the settings Zustand store (persisted via `repo.setSetting`). `AppShell` toggles the class and conditionally renders orb/vignette elements. No component other than `AppShell` and `SettingsDialog` needs to change.

**Tech Stack:** React, Zustand, Tailwind CSS v4, Vitest

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/store/settings.ts` | Add `glassmorphismEnabled` state + action |
| Create | `src/store/settings.test.ts` | Verify default value and toggle behavior |
| Modify | `src/index.css` | Scope glass-* rules under `.glass`; add flat fallbacks |
| Modify | `src/components/layout/AppShell.tsx` | Toggle `.glass` on `<html>`; conditional orb/vignette render |
| Modify | `src/components/layout/SettingsDialog.tsx` | Add glassmorphism checkbox in Appearance section |
| Modify | `src/i18n/locales/en.ts` | Add `settings.glassmorphism` key |
| Modify | `src/i18n/locales/fr.ts` | Add `settings.glassmorphism` key |

---

### Task 1: Settings store — add `glassmorphismEnabled`

**Files:**
- Modify: `src/store/settings.ts`
- Create: `src/store/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSettingsStore } from "./settings";

const mockRepo = {
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue({}),
};

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ glassmorphismEnabled: false });
});

describe("useSettingsStore glassmorphism", () => {
  it("defaults glassmorphismEnabled to false", () => {
    expect(useSettingsStore.getState().glassmorphismEnabled).toBe(false);
  });

  it("setGlassmorphismEnabled updates state and persists", async () => {
    await useSettingsStore.getState().setGlassmorphismEnabled(mockRepo as any, true);
    expect(useSettingsStore.getState().glassmorphismEnabled).toBe(true);
    expect(mockRepo.setSetting).toHaveBeenCalledWith("glassmorphism_enabled", "true");
  });

  it("loadSettings restores glassmorphismEnabled from persisted value", async () => {
    mockRepo.getSettings.mockResolvedValueOnce({ glassmorphism_enabled: "true" });
    await useSettingsStore.getState().loadSettings(mockRepo as any);
    expect(useSettingsStore.getState().glassmorphismEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: FAIL — `glassmorphismEnabled` does not exist on store.

- [ ] **Step 3: Add `glassmorphismEnabled` to `src/store/settings.ts`**

In the `SettingsStore` interface, add:
```ts
glassmorphismEnabled: boolean;
setGlassmorphismEnabled(repo: TodoRepository, enabled: boolean): Promise<void>;
```

In the `create<SettingsStore>((set) => ({ ... }))` object, add the default:
```ts
glassmorphismEnabled: false,
```

In `loadSettings`, add to the `set(...)` call (after reading the existing settings):
```ts
const glassmorphismEnabled = raw["glassmorphism_enabled"] === "true";
set({ notificationsEnabled, notificationTimes, parallaxEnabled, glassmorphismEnabled });
```

Add the action:
```ts
async setGlassmorphismEnabled(repo, enabled) {
  await repo.setSetting("glassmorphism_enabled", String(enabled));
  set({ glassmorphismEnabled: enabled });
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: PASS — all 3 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/store/settings.ts src/store/settings.test.ts
git commit -m "feat: add glassmorphismEnabled to settings store"
```

---

### Task 2: CSS — scope glass rules under `.glass`, add flat fallbacks

**Files:**
- Modify: `src/index.css` lines 32–133 (`.app-shell` through `.glass-panel`)

- [ ] **Step 1: Replace the glass surface block in `src/index.css`**

Replace everything from `/* ── Animated background ───── */` through the end of `.dark .glass-panel { ... }` (lines 32–133) with the following:

```css
/* ── Animated background ───────────────────────────────────── */
.app-shell {
  background: var(--background);
  transition: background 0.4s ease;
}

/* ── Background vignette ──────────────────────────────────── */
.app-vignette {
  background: radial-gradient(ellipse 75% 70% at 50% 50%, transparent 30%, var(--vignette-end-color) 100%);
}

/* ── Orb containers & blobs ───────────────────────────────── */
.app-orb-wrap-1 { animation: orb1 18s ease-in-out infinite; }
.app-orb-wrap-2 { animation: orb2 22s ease-in-out infinite; }
.app-orb-wrap-3 { animation: orb3 27s ease-in-out infinite; }

.app-orb-1 {
  top: 5%; left: 10%;
  width: 500px; height: 500px;
  border-radius: 50%;
  background: var(--orb-1-color);
  filter: blur(90px);
  will-change: filter, transform;
}

.app-orb-2 {
  bottom: 8%; right: 12%;
  width: 380px; height: 380px;
  border-radius: 50%;
  background: var(--orb-2-color);
  filter: blur(80px);
  will-change: filter, transform;
}

.app-orb-3 {
  top: 45%; left: 40%;
  width: 300px; height: 300px;
  border-radius: 50%;
  background: var(--orb-3-color);
  filter: blur(70px);
  will-change: filter, transform;
}

/* ── Flat surface fallbacks (no glassmorphism) ─────────────── */
.glass-sidebar {
  border-right: 1px solid var(--border);
}

.glass-card {
  background: var(--card);
}

.glass-stat {
  background: var(--muted);
  border: 1px solid var(--border);
}

.glass-header {
  border-bottom: 1px solid var(--border);
}

.glass-panel {
  background: var(--card);
  border-left: 1px solid var(--border);
}

/* ── Glassmorphism surfaces (active when .glass is on <html>) ─ */
.glass .app-shell {
  background: var(--app-gradient);
}

.glass .glass-sidebar {
  border-right: 1px solid var(--glass-border-color) !important;
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
}

.glass .glass-card {
  background: rgba(255, 255, 255, 0.58);
  border-color: var(--glass-border-color) !important;
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
}
.dark.glass .glass-card {
  background: rgba(255, 255, 255, 0.05);
}
.glass .glass-card:hover,
.glass .glass-card.selected {
  background: rgba(255, 255, 255, 0.88);
  border-color: var(--glass-border-hover-color) !important;
}
.dark.glass .glass-card:hover,
.dark.glass .glass-card.selected {
  background: rgba(255, 255, 255, 0.09);
}

.glass .glass-stat {
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  border: 1px solid var(--glass-border-color);
}
.dark.glass .glass-stat {
  background: rgba(255, 255, 255, 0.06);
}

.glass .glass-header {
  background: transparent;
  border-bottom: 1px solid var(--glass-border-color) !important;
}

.glass .glass-panel {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border-left: 1px solid var(--glass-border-color) !important;
}
.dark.glass .glass-panel {
  background: rgba(255, 255, 255, 0.07);
}
```

> **Note on `.dark.glass`:** Both `.dark` and `.glass` are set on `<html>`. `.dark.glass .glass-card` means "an element with both classes on the same ancestor" — this is the correct selector when both classes are on `<html>`.

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat: scope glass CSS under .glass ancestor class"
```

---

### Task 3: AppShell — toggle `.glass` class + conditional orb/vignette render

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Read the current file**

Open `src/components/layout/AppShell.tsx` and confirm it currently reads `parallaxEnabled` from `useSettingsStore`.

- [ ] **Step 2: Apply changes**

Replace the entire file content with:

```tsx
import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { ResizeHandle } from "./ResizeHandle";
import { TagManager } from "@/components/tags/TagManager";
import { useUIStore } from "@/store/ui";
import { useResizable } from "@/hooks/useResizable";
import { useOrbParallax } from "@/hooks/useOrbParallax";
import { useSettingsStore } from "@/store/settings";

export function AppShell() {
  const { selectedTaskId, selectedProjectId } = useUIStore();
  const parallaxEnabled = useSettingsStore((s) => s.parallaxEnabled);
  const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
  const { width, isDragging, onMouseDown } = useResizable({
    storageKey: "task-detail-width",
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 600,
  });
  const { setOrbRef } = useOrbParallax(parallaxEnabled && glassmorphismEnabled);

  useEffect(() => {
    document.documentElement.classList.toggle("glass", glassmorphismEnabled);
  }, [glassmorphismEnabled]);

  const showDetail = selectedTaskId && selectedProjectId !== "tags";

  return (
    <div className="app-shell relative flex h-screen overflow-hidden text-foreground">
      {glassmorphismEnabled && (
        <>
          <div className="app-vignette pointer-events-none absolute inset-0 z-[1]" />
          <div ref={setOrbRef(0)} className="pointer-events-none absolute inset-0 z-0">
            <div className="app-orb-wrap-1 absolute inset-0">
              <div className="app-orb-1 absolute" />
            </div>
          </div>
          <div ref={setOrbRef(1)} className="pointer-events-none absolute inset-0 z-0">
            <div className="app-orb-wrap-2 absolute inset-0">
              <div className="app-orb-2 absolute" />
            </div>
          </div>
          <div ref={setOrbRef(2)} className="pointer-events-none absolute inset-0 z-0">
            <div className="app-orb-wrap-3 absolute inset-0">
              <div className="app-orb-3 absolute" />
            </div>
          </div>
        </>
      )}

      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <Sidebar />
        {selectedProjectId === "tags" ? <TagManager /> : <TaskList />}
        {showDetail && (
          <>
            <ResizeHandle onMouseDown={onMouseDown} isDragging={isDragging} />
            <TaskDetail width={width} />
          </>
        )}
      </div>
    </div>
  );
}
```

> **Note:** `useOrbParallax` now receives `parallaxEnabled && glassmorphismEnabled` — parallax is meaningless without orbs in the DOM, so the combined guard avoids starting the RAF loop when glass is off.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: toggle .glass class on html and conditionally render orbs"
```

---

### Task 4: i18n — add glassmorphism labels

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Add key to `src/i18n/locales/en.ts`**

In the `settings` object, after the `parallax` key, add:
```ts
glassmorphism: "Glassmorphism",
```

- [ ] **Step 2: Add key to `src/i18n/locales/fr.ts`**

In the `settings` object, after the `parallax` key, add:
```ts
glassmorphism: "Glassmorphisme",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/fr.ts
git commit -m "feat: add glassmorphism i18n keys"
```

---

### Task 5: SettingsDialog — add glassmorphism checkbox

**Files:**
- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1: Add store selectors in the component body**

In `SettingsDialog`, after the `parallaxEnabled` / `setParallaxEnabled` lines (around line 243–246), add:

```ts
const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
const setGlassmorphismEnabled = useSettingsStore((s) => s.setGlassmorphismEnabled);
```

- [ ] **Step 2: Add the checkbox in JSX**

After the existing parallax toggle block (the `<div className="flex items-center justify-between">` for parallax, around line 350–359), add:

```tsx
<div className="flex items-center justify-between">
  <label className="text-sm text-foreground cursor-pointer select-none" htmlFor="glass-toggle">
    {t("settings.glassmorphism")}
  </label>
  <Checkbox
    id="glass-toggle"
    checked={glassmorphismEnabled}
    onCheckedChange={(v) => setGlassmorphismEnabled(getRepository(), v === true)}
  />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/SettingsDialog.tsx
git commit -m "feat: add glassmorphism toggle in settings appearance section"
```

---

## Manual verification checklist

After all tasks are complete:

- [ ] Launch dev server: `pnpm dev`
- [ ] Open Settings → Appearance — glassmorphism checkbox is present, unchecked by default
- [ ] Background is solid `var(--background)`, no orbs/vignette visible
- [ ] Sidebar, cards, header, stats, detail panel have opaque solid backgrounds
- [ ] Check the checkbox → orbs appear, backdrop-blur on surfaces activates, gradient background shows
- [ ] Uncheck → orbs disappear, surfaces become flat/solid again
- [ ] Switch themes while glass is on — gradient and orb colors update per theme
- [ ] Switch themes while glass is off — background stays solid per `var(--background)` for each theme
- [ ] Reload app with glass saved as enabled → glass state is restored from DB
- [ ] Run full test suite: `pnpm test:run`
