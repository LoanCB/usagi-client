# Dark Themes: Rose Noir & Cosmic Gold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new dark themes — `rose-noir` (cyberpunk/neon magenta) and `cosmic-gold` (luxurious warm gold) — to the theme system.

**Architecture:** Each theme is a standalone TypeScript file exporting a `Theme` object with OKLCH color tokens. Registration requires touching `ThemeProvider.tsx` (routing), `SettingsDialog.tsx` (UI picker), and the two i18n locale files.

**Tech Stack:** TypeScript, Vitest, React, OKLCH color tokens, i18next

---

### Task 1: Write failing tests for the two new theme files

**Files:**

- Modify: `src/test/ThemeToggle.test.tsx`

- [ ] **Step 1: Add theme structure tests**

Append to `src/test/ThemeToggle.test.tsx`:

```tsx
import { roseNoirTheme } from "@/theme/themes/roseNoir";
import { cosmicGoldTheme } from "@/theme/themes/cosmicGold";
import type { ThemeTokens } from "@/theme/types";

const REQUIRED_TOKENS: (keyof ThemeTokens)[] = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
  "--destructive",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--radius",
  "--priority-high",
  "--priority-medium",
  "--priority-low",
  "--app-gradient",
  "--orb-1-color",
  "--orb-2-color",
  "--orb-3-color",
  "--vignette-end-color",
  "--glass-border-color",
  "--glass-border-hover-color",
];

describe("roseNoirTheme", () => {
  it("has name 'rose-noir'", () => {
    expect(roseNoirTheme.name).toBe("rose-noir");
  });
  it("has all required tokens", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(
        roseNoirTheme.tokens[token],
        `missing token ${token}`,
      ).toBeDefined();
    }
  });
});

describe("cosmicGoldTheme", () => {
  it("has name 'cosmic-gold'", () => {
    expect(cosmicGoldTheme.name).toBe("cosmic-gold");
  });
  it("has all required tokens", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(
        cosmicGoldTheme.tokens[token],
        `missing token ${token}`,
      ).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test src/test/ThemeToggle.test.tsx
```

Expected: FAIL — `Cannot find module '@/theme/themes/roseNoir'`

---

### Task 2: Create `roseNoir.ts`

**Files:**

- Create: `src/theme/themes/roseNoir.ts`

- [ ] **Step 1: Create the file**

```ts
import type { Theme } from "../types";

// Cyberpunk/neon dark theme — vivid magenta accent on a near-black rose background
export const roseNoirTheme: Theme = {
  name: "rose-noir",
  tokens: {
    "--background": "oklch(0.07 0.025 345)",
    "--foreground": "oklch(0.97 0.01 345)",
    "--card": "oklch(1 0 0 / 5%)",
    "--card-foreground": "oklch(0.97 0.01 345)",
    "--popover": "oklch(0.13 0.035 345)",
    "--popover-foreground": "oklch(0.97 0.01 345)",
    "--primary": "oklch(0.68 0.30 340)",
    "--primary-foreground": "oklch(0.07 0.025 345)",
    "--secondary": "oklch(0.17 0.04 340)",
    "--secondary-foreground": "oklch(0.97 0.01 345)",
    "--muted": "oklch(0.17 0.04 340)",
    "--muted-foreground": "oklch(0.56 0.07 340)",
    "--accent": "oklch(0.68 0.30 340 / 18%)",
    "--accent-foreground": "oklch(0.97 0.01 345)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 12%)",
    "--ring": "oklch(0.68 0.30 340)",
    "--destructive": "oklch(0.665 0.213 26)",
    "--chart-1": "oklch(0.68 0.30 340)",
    "--chart-2": "oklch(0.72 0.25 300)",
    "--chart-3": "oklch(0.74 0.22 195)",
    "--chart-4": "oklch(0.65 0.28 15)",
    "--chart-5": "oklch(0.75 0.18 260)",
    "--sidebar": "oklch(0 0 0 / 32%)",
    "--sidebar-foreground": "oklch(0.97 0.01 345)",
    "--sidebar-primary": "oklch(0.68 0.30 340)",
    "--sidebar-primary-foreground": "oklch(0.97 0.01 345)",
    "--sidebar-accent": "oklch(0.68 0.30 340 / 15%)",
    "--sidebar-accent-foreground": "oklch(0.97 0.01 345)",
    "--sidebar-border": "oklch(1 0 0 / 8%)",
    "--sidebar-ring": "oklch(0.68 0.30 340)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.665 0.245 15)",
    "--priority-medium": "oklch(0.68 0.30 340)",
    "--priority-low": "oklch(0.72 0.18 285)",
    "--app-gradient":
      "radial-gradient(ellipse 80% 60% at 20% 20%, #1a0018 0%, #0d0009 45%, #060005 100%)",
    "--orb-1-color": "rgba(255, 20, 147, 0.40)",
    "--orb-2-color": "rgba(200, 0, 200, 0.20)",
    "--orb-3-color": "rgba(0, 0, 0, 0.30)",
    "--vignette-end-color": "rgba(0, 0, 0, 0.55)",
    "--glass-border-color": "rgba(255, 61, 168, 0.14)",
    "--glass-border-hover-color": "rgba(255, 61, 168, 0.28)",
  },
};
```

---

### Task 3: Create `cosmicGold.ts`

**Files:**

- Create: `src/theme/themes/cosmicGold.ts`

- [ ] **Step 1: Create the file**

```ts
import type { Theme } from "../types";

// Luxurious/royal dark theme — rich gold accent on a near-black warm amber background
export const cosmicGoldTheme: Theme = {
  name: "cosmic-gold",
  tokens: {
    "--background": "oklch(0.08 0.018 65)",
    "--foreground": "oklch(0.97 0.015 80)",
    "--card": "oklch(1 0 0 / 5%)",
    "--card-foreground": "oklch(0.97 0.015 80)",
    "--popover": "oklch(0.13 0.025 65)",
    "--popover-foreground": "oklch(0.97 0.015 80)",
    "--primary": "oklch(0.72 0.16 72)",
    "--primary-foreground": "oklch(0.08 0.018 65)",
    "--secondary": "oklch(0.17 0.03 65)",
    "--secondary-foreground": "oklch(0.97 0.015 80)",
    "--muted": "oklch(0.17 0.03 65)",
    "--muted-foreground": "oklch(0.56 0.05 70)",
    "--accent": "oklch(0.72 0.16 72 / 15%)",
    "--accent-foreground": "oklch(0.97 0.015 80)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 12%)",
    "--ring": "oklch(0.72 0.16 72)",
    "--destructive": "oklch(0.665 0.213 26)",
    "--chart-1": "oklch(0.72 0.16 72)",
    "--chart-2": "oklch(0.65 0.19 40)",
    "--chart-3": "oklch(0.78 0.14 90)",
    "--chart-4": "oklch(0.60 0.15 55)",
    "--chart-5": "oklch(0.55 0.12 30)",
    "--sidebar": "oklch(0 0 0 / 28%)",
    "--sidebar-foreground": "oklch(0.97 0.015 80)",
    "--sidebar-primary": "oklch(0.72 0.16 72)",
    "--sidebar-primary-foreground": "oklch(0.97 0.015 80)",
    "--sidebar-accent": "oklch(0.72 0.16 72 / 12%)",
    "--sidebar-accent-foreground": "oklch(0.97 0.015 80)",
    "--sidebar-border": "oklch(1 0 0 / 8%)",
    "--sidebar-ring": "oklch(0.72 0.16 72)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.665 0.213 26)",
    "--priority-medium": "oklch(0.72 0.16 72)",
    "--priority-low": "oklch(0.65 0.15 145)",
    "--app-gradient":
      "radial-gradient(ellipse 80% 60% at 20% 20%, #1a1200 0%, #100b00 45%, #060400 100%)",
    "--orb-1-color": "rgba(212, 160, 23, 0.38)",
    "--orb-2-color": "rgba(180, 130, 10, 0.18)",
    "--orb-3-color": "rgba(0, 0, 0, 0.30)",
    "--vignette-end-color": "rgba(0, 0, 0, 0.50)",
    "--glass-border-color": "rgba(212, 160, 23, 0.14)",
    "--glass-border-hover-color": "rgba(212, 160, 23, 0.28)",
  },
};
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
pnpm test src/test/ThemeToggle.test.tsx
```

Expected: all `roseNoirTheme` and `cosmicGoldTheme` tests PASS.

---

### Task 4: Register themes in `ThemeProvider.tsx`

**Files:**

- Modify: `src/theme/ThemeProvider.tsx`

- [ ] **Step 1: Add imports** (after the `deepOceanTheme` import line)

```ts
import { cosmicGoldTheme } from "./themes/cosmicGold";
import { roseNoirTheme } from "./themes/roseNoir";
```

- [ ] **Step 2: Update `isDarkTheme()`**

Replace:

```ts
return (
  mode === "dark" ||
  mode === "dracula" ||
  mode === "ember" ||
  mode === "contrast" ||
  mode === "deep-ocean"
);
```

With:

```ts
return (
  mode === "dark" ||
  mode === "dracula" ||
  mode === "ember" ||
  mode === "contrast" ||
  mode === "deep-ocean" ||
  mode === "rose-noir" ||
  mode === "cosmic-gold"
);
```

- [ ] **Step 3: Update `resolveTheme()`**

Add before the final `return` line:

```ts
if (mode === "rose-noir") return roseNoirTheme;
if (mode === "cosmic-gold") return cosmicGoldTheme;
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/test/ThemeToggle.test.tsx
```

Expected: all tests PASS.

---

### Task 5: Add themes to the settings picker

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1: Extend `CustomThemeLabelKey`**

Replace:

```ts
type CustomThemeLabelKey =
  | "theme.luxury"
  | "theme.nature"
  | "theme.dracula"
  | "theme.retro"
  | "theme.ember"
  | "theme.deepOcean"
  | "theme.ocean";
```

With:

```ts
type CustomThemeLabelKey =
  | "theme.luxury"
  | "theme.nature"
  | "theme.dracula"
  | "theme.retro"
  | "theme.ember"
  | "theme.deepOcean"
  | "theme.ocean"
  | "theme.roseNoir"
  | "theme.cosmicGold";
```

- [ ] **Step 2: Add entries to `CUSTOM_THEMES`**

After the `{ mode: "ocean", ... }` entry, add:

```ts
  {
    mode: "rose-noir",
    color: "oklch(0.68 0.30 340)",
    labelKey: "theme.roseNoir",
  },
  {
    mode: "cosmic-gold",
    color: "oklch(0.72 0.16 72)",
    labelKey: "theme.cosmicGold",
  },
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/test/ThemeToggle.test.tsx
```

Expected: all tests PASS.

---

### Task 6: Add i18n labels

**Files:**

- Modify: `src/i18n/locales/fr.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] **Step 1: Update `fr.ts`**

Inside the `theme:` object (after `ocean: "Océan"`), add:

```ts
      roseNoir: "Rose Noir",
      cosmicGold: "Or cosmique",
```

- [ ] **Step 2: Update `en.ts`**

Inside the `theme:` object (after `ocean: "Ocean"`), add:

```ts
      roseNoir: "Rose Noir",
      cosmicGold: "Cosmic Gold",
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all tests PASS.
