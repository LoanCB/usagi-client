# Theme Ocean/Light Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renommer le thème "light" actuel en "ocean", et le remplacer par un thème clair minimaliste slate/froid sans parallax visible.

**Architecture:** Ajout d'un fichier `ocean.ts` (copie de l'actuel `light.ts`), remplacement complet de `light.ts` par une palette slate/froid avec orbes transparents, puis câblage dans `ThemeProvider`, `SettingsDialog` et les fichiers i18n. Aucun changement architectural — les orbes restent dans le DOM mais sont invisibles (`transparent`).

**Tech Stack:** TypeScript, React 19, Tailwind CSS v4, oklch color space, Zustand, i18next

---

## File Map

| Fichier | Action |
|---|---|
| `src/theme/themes/ocean.ts` | Créer — copie de l'actuel light avec `name: "ocean"` |
| `src/theme/themes/light.ts` | Remplacer — nouveau thème slate/froid |
| `src/theme/ThemeProvider.tsx` | Modifier — import + `resolveTheme` |
| `src/components/layout/SettingsDialog.tsx` | Modifier — `CustomThemeLabelKey` + `CUSTOM_THEMES` |
| `src/i18n/locales/fr.ts` | Modifier — clé `ocean` |
| `src/i18n/locales/en.ts` | Modifier — clé `ocean` |

---

### Task 1 : Créer le thème Ocean

**Files:**
- Create: `src/theme/themes/ocean.ts`

- [ ] **Step 1 : Créer `ocean.ts`** — copie exacte de l'actuel `light.ts` avec `name: "ocean"`

```typescript
import type { Theme } from "../types";

export const oceanTheme: Theme = {
  name: "ocean",
  tokens: {
    "--background": "oklch(0.97 0.01 193)",
    "--foreground": "oklch(0.13 0.02 193)",
    "--card": "oklch(1 0 0 / 60%)",
    "--card-foreground": "oklch(0.13 0.02 193)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.13 0.02 193)",
    "--primary": "oklch(0.62 0.15 193)",
    "--primary-foreground": "oklch(0.98 0 0)",
    "--secondary": "oklch(0.94 0.02 193)",
    "--secondary-foreground": "oklch(0.13 0.02 193)",
    "--muted": "oklch(0.94 0.02 193)",
    "--muted-foreground": "oklch(0.50 0.03 193)",
    "--accent": "oklch(0.94 0.02 193)",
    "--accent-foreground": "oklch(0.13 0.02 193)",
    "--border": "oklch(0.62 0.15 193 / 12%)",
    "--input": "oklch(0.62 0.15 193 / 14%)",
    "--ring": "oklch(0.62 0.15 193)",
    "--destructive": "oklch(0.577 0.245 27.325)",
    "--chart-1": "oklch(0.87 0 0)",
    "--chart-2": "oklch(0.556 0 0)",
    "--chart-3": "oklch(0.439 0 0)",
    "--chart-4": "oklch(0.371 0 0)",
    "--chart-5": "oklch(0.269 0 0)",
    "--sidebar": "oklch(1 0 0 / 52%)",
    "--sidebar-foreground": "oklch(0.13 0.02 193)",
    "--sidebar-primary": "oklch(0.62 0.15 193)",
    "--sidebar-primary-foreground": "oklch(0.98 0 0)",
    "--sidebar-accent": "oklch(0.62 0.15 193 / 10%)",
    "--sidebar-accent-foreground": "oklch(0.13 0.02 193)",
    "--sidebar-border": "oklch(0.62 0.15 193 / 12%)",
    "--sidebar-ring": "oklch(0.62 0.15 193)",
    "--radius": "0.625rem",
    "--priority-high": "oklch(0.577 0.245 27.325)",
    "--priority-medium": "oklch(0.769 0.188 70.08)",
    "--priority-low": "oklch(0.627 0.194 149.214)",
    "--app-gradient": "radial-gradient(ellipse 80% 60% at 20% 10%, #d8f5f9 0%, #eefafb 40%, #f7fcfd 100%)",
    "--orb-1-color": "rgba(6, 182, 212, 0.13)",
    "--orb-2-color": "rgba(6, 182, 212, 0.07)",
    "--orb-3-color": "rgba(6, 182, 212, 0.05)",
    "--vignette-end-color": "rgba(6, 182, 212, 0.08)",
    "--glass-border-color": "rgba(6, 182, 212, 0.12)",
    "--glass-border-hover-color": "rgba(6, 182, 212, 0.24)",
  },
};
```

- [ ] **Step 2 : Commit**

```bash
git add src/theme/themes/ocean.ts
git commit -m "feat: add ocean theme (former light theme)"
```

---

### Task 2 : Remplacer le thème Light

**Files:**
- Modify: `src/theme/themes/light.ts`

- [ ] **Step 1 : Remplacer intégralement `light.ts`** par la palette slate/froid

```typescript
import type { Theme } from "../types";

export const lightTheme: Theme = {
  name: "light",
  tokens: {
    "--background": "oklch(0.98 0.005 240)",
    "--foreground": "oklch(0.10 0.01 240)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.10 0.01 240)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.10 0.01 240)",
    "--primary": "oklch(0.15 0.01 240)",
    "--primary-foreground": "oklch(0.99 0 0)",
    "--secondary": "oklch(0.93 0.008 240)",
    "--secondary-foreground": "oklch(0.15 0.01 240)",
    "--muted": "oklch(0.93 0.008 240)",
    "--muted-foreground": "oklch(0.50 0.01 240)",
    "--accent": "oklch(0.93 0.008 240)",
    "--accent-foreground": "oklch(0.15 0.01 240)",
    "--border": "oklch(0 0 0 / 10%)",
    "--input": "oklch(0 0 0 / 8%)",
    "--ring": "oklch(0.15 0.01 240)",
    "--destructive": "oklch(0.577 0.245 27.325)",
    "--chart-1": "oklch(0.87 0 0)",
    "--chart-2": "oklch(0.556 0 0)",
    "--chart-3": "oklch(0.439 0 0)",
    "--chart-4": "oklch(0.371 0 0)",
    "--chart-5": "oklch(0.269 0 0)",
    "--sidebar": "oklch(1 0 0 / 80%)",
    "--sidebar-foreground": "oklch(0.10 0.01 240)",
    "--sidebar-primary": "oklch(0.15 0.01 240)",
    "--sidebar-primary-foreground": "oklch(0.99 0 0)",
    "--sidebar-accent": "oklch(0 0 0 / 6%)",
    "--sidebar-accent-foreground": "oklch(0.10 0.01 240)",
    "--sidebar-border": "oklch(0 0 0 / 10%)",
    "--sidebar-ring": "oklch(0.15 0.01 240)",
    "--radius": "0.25rem",
    "--priority-high": "oklch(0.577 0.245 27.325)",
    "--priority-medium": "oklch(0.769 0.188 70.08)",
    "--priority-low": "oklch(0.627 0.194 149.214)",
    "--app-gradient": "oklch(0.97 0.006 240)",
    "--orb-1-color": "transparent",
    "--orb-2-color": "transparent",
    "--orb-3-color": "transparent",
    "--vignette-end-color": "transparent",
    "--glass-border-color": "oklch(0 0 0 / 10%)",
    "--glass-border-hover-color": "oklch(0 0 0 / 18%)",
  },
};
```

- [ ] **Step 2 : Commit**

```bash
git add src/theme/themes/light.ts
git commit -m "feat: replace light theme with minimal slate/cool palette"
```

---

### Task 3 : Câbler ThemeProvider

**Files:**
- Modify: `src/theme/ThemeProvider.tsx`

- [ ] **Step 1 : Ajouter l'import `oceanTheme` et l'entrée dans `resolveTheme`**

Dans `src/theme/ThemeProvider.tsx`, ajouter l'import après les autres imports de thèmes :

```typescript
import { oceanTheme } from "./themes/ocean";
```

Puis dans `resolveTheme`, ajouter la ligne pour `"ocean"` juste après `"light"` :

```typescript
function resolveTheme(mode: ThemeMode, prefersDark: boolean): Theme {
  if (mode === "system") return prefersDark ? darkTheme : lightTheme;
  if (mode === "dark") return darkTheme;
  if (mode === "light") return lightTheme;
  if (mode === "ocean") return oceanTheme;        // ← ajouter cette ligne
  if (mode === "luxury") return luxuryTheme;
  if (mode === "nature") return natureTheme;
  if (mode === "dracula") return draculaTheme;
  if (mode === "retro") return retroTheme;
  if (mode === "ember") return emberTheme;
  if (mode === "contrast") return contrastTheme;
  return prefersDark ? darkTheme : lightTheme;
}
```

> Note : `isDarkTheme` n'a pas besoin de modification — "ocean" n'est pas listé dans les thèmes sombres et retourne `false` par défaut, ce qui est correct.

- [ ] **Step 2 : Commit**

```bash
git add src/theme/ThemeProvider.tsx
git commit -m "feat: wire ocean theme in ThemeProvider"
```

---

### Task 4 : Câbler SettingsDialog

**Files:**
- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1 : Ajouter `"theme.ocean"` au type `CustomThemeLabelKey`**

Ligne 140 environ — remplacer :

```typescript
type CustomThemeLabelKey = "theme.luxury" | "theme.nature" | "theme.dracula" | "theme.retro" | "theme.ember" | "theme.contrast";
```

par :

```typescript
type CustomThemeLabelKey = "theme.luxury" | "theme.nature" | "theme.dracula" | "theme.retro" | "theme.ember" | "theme.contrast" | "theme.ocean";
```

- [ ] **Step 2 : Ajouter "ocean" dans le tableau `CUSTOM_THEMES`**

Dans le tableau `CUSTOM_THEMES` (ligne 141 environ), ajouter l'entrée ocean à la fin :

```typescript
const CUSTOM_THEMES: { mode: ThemeMode; color: string; labelKey: CustomThemeLabelKey }[] = [
  { mode: "luxury",   color: "oklch(0.46 0.18 20)",    labelKey: "theme.luxury" },
  { mode: "nature",   color: "oklch(0.59 0.19 145)",   labelKey: "theme.nature" },
  { mode: "dracula",  color: "oklch(0.716 0.171 295)", labelKey: "theme.dracula" },
  { mode: "retro",    color: "oklch(0.50 0.10 55)",    labelKey: "theme.retro" },
  { mode: "ember",    color: "oklch(0.70 0.22 42)",    labelKey: "theme.ember" },
  { mode: "contrast", color: "oklch(0.98 0 0)",        labelKey: "theme.contrast" },
  { mode: "ocean",    color: "oklch(0.62 0.15 193)",   labelKey: "theme.ocean" },
];
```

- [ ] **Step 3 : Commit**

```bash
git add src/components/layout/SettingsDialog.tsx
git commit -m "feat: add ocean theme to settings UI"
```

---

### Task 5 : Traductions i18n

**Files:**
- Modify: `src/i18n/locales/fr.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] **Step 1 : Ajouter la clé `ocean` dans `fr.ts`**

Dans la section `theme:` de `src/i18n/locales/fr.ts`, ajouter après `contrast` :

```typescript
ocean: "Océan",
```

La section complète doit ressembler à :

```typescript
theme: {
  light: "Clair",
  dark: "Sombre",
  system: "Système",
  luxury: "Luxe",
  nature: "Nature",
  dracula: "Dracula",
  retro: "Rétro",
  ember: "Ember",
  contrast: "Contraste",
  ocean: "Océan",
},
```

- [ ] **Step 2 : Ajouter la clé `ocean` dans `en.ts`**

Dans la section `theme:` de `src/i18n/locales/en.ts`, ajouter après `contrast` :

```typescript
ocean: "Ocean",
```

- [ ] **Step 3 : Commit**

```bash
git add src/i18n/locales/fr.ts src/i18n/locales/en.ts
git commit -m "feat: add ocean i18n translations"
```

---

### Task 6 : Vérification visuelle

**Files:** aucun

- [ ] **Step 1 : Lancer le build TypeScript**

```bash
pnpm tsc --noEmit
```

Expected : aucune erreur.

- [ ] **Step 2 : Lancer le dev server**

```bash
pnpm dev
```

- [ ] **Step 3 : Vérifier les thèmes dans les Settings**

Ouvrir les Settings → section Appearance :
- Le bouton "Clair" (icône soleil) applique le nouveau thème slate/froid — fond `#f6f8fa`, coins carrés, aucune bulle de fond.
- Le thème "Océan" apparaît dans la grille custom avec un point cyan — applique l'ancien visuel glassmorphism cyan.
- Le mode "Système" en OS light → thème slate/froid.
- Tous les autres thèmes (dark, luxury, nature…) restent inchangés.
