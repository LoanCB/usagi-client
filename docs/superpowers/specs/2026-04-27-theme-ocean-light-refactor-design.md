# Design — Refonte thèmes clair/océan

**Date :** 2026-04-27  
**Statut :** Approuvé

---

## Contexte

Le thème "Clair" actuel est un thème glassmorphism cyan avec orbes parallax et dégradé coloré. L'objectif est de le renommer "Océan" (thème custom) et de créer un nouveau thème "Clair" minimaliste sans effet visuel de fond, qui devient le fallback du mode Système.

---

## Changements

### 1. Nouveau fichier `src/theme/themes/ocean.ts`

Copie exacte du contenu actuel de `light.ts`, avec `name: "ocean"`.  
Aucun token modifié — le visuel océan est conservé à l'identique.

### 2. Remplacement de `src/theme/themes/light.ts`

Nouveau thème "Clair" minimaliste — palette slate/froid :

| Token | Valeur | Rôle |
|---|---|---|
| `--background` | `oklch(0.98 0.005 240)` | Blanc légèrement bleuté |
| `--foreground` | `oklch(0.10 0.01 240)` | Quasi-noir froid |
| `--card` | `oklch(1 0 0)` | Blanc pur |
| `--card-foreground` | `oklch(0.10 0.01 240)` | |
| `--popover` | `oklch(1 0 0)` | |
| `--popover-foreground` | `oklch(0.10 0.01 240)` | |
| `--primary` | `oklch(0.15 0.01 240)` | Quasi-noir froid |
| `--primary-foreground` | `oklch(0.99 0 0)` | Blanc |
| `--secondary` | `oklch(0.93 0.008 240)` | Gris slate clair |
| `--secondary-foreground` | `oklch(0.15 0.01 240)` | |
| `--muted` | `oklch(0.93 0.008 240)` | |
| `--muted-foreground` | `oklch(0.50 0.01 240)` | Gris moyen |
| `--accent` | `oklch(0.93 0.008 240)` | |
| `--accent-foreground` | `oklch(0.15 0.01 240)` | |
| `--border` | `oklch(0 0 0 / 10%)` | |
| `--input` | `oklch(0 0 0 / 8%)` | |
| `--ring` | `oklch(0.15 0.01 240)` | |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Inchangé |
| `--sidebar` | `oklch(1 0 0 / 80%)` | |
| `--sidebar-foreground` | `oklch(0.10 0.01 240)` | |
| `--sidebar-primary` | `oklch(0.15 0.01 240)` | |
| `--sidebar-primary-foreground` | `oklch(0.99 0 0)` | |
| `--sidebar-accent` | `oklch(0 0 0 / 6%)` | |
| `--sidebar-accent-foreground` | `oklch(0.10 0.01 240)` | |
| `--sidebar-border` | `oklch(0 0 0 / 10%)` | |
| `--sidebar-ring` | `oklch(0.15 0.01 240)` | |
| `--radius` | `0.25rem` | Coins carrés, comme Contrast |
| `--priority-high` | `oklch(0.577 0.245 27.325)` | Rouge |
| `--priority-medium` | `oklch(0.769 0.188 70.08)` | Jaune |
| `--priority-low` | `oklch(0.627 0.194 149.214)` | Vert |
| `--app-gradient` | `oklch(0.97 0.006 240)` — couleur unie, pas de gradient | Fond plat |
| `--orb-1-color` | `transparent` | Pas de bulle |
| `--orb-2-color` | `transparent` | |
| `--orb-3-color` | `transparent` | |
| `--vignette-end-color` | `transparent` | |
| `--glass-border-color` | `oklch(0 0 0 / 10%)` | |
| `--glass-border-hover-color` | `oklch(0 0 0 / 18%)` | |

> **Pas de parallax :** les orbes étant `transparent`, l'effet JS tourne en arrière-plan sans aucun rendu visible. Aucun changement architectural requis.

### 3. `src/theme/ThemeProvider.tsx`

- Importer `oceanTheme` depuis `./themes/ocean`
- Dans `resolveTheme` : ajouter `if (mode === "ocean") return oceanTheme;`
- Dans `isDarkTheme` : `"ocean"` n'est pas listé → retourne `false` par défaut (correct)

### 4. `src/components/layout/SettingsDialog.tsx`

- Ajouter `"ocean"` dans `CUSTOM_THEMES` avec `color: "oklch(0.62 0.15 193)"` (cyan) et `labelKey: "theme.ocean"`
- Ajouter le type `"theme.ocean"` à `CustomThemeLabelKey`

### 5. Traductions i18n

**`src/i18n/locales/fr.ts`** — dans `theme` :
```
ocean: "Océan",
```

**`src/i18n/locales/en.ts`** — dans `theme` :
```
ocean: "Ocean",
```

---

## Ce qui ne change pas

- Le bouton "Clair" (icône soleil) dans la rangée du haut pointe toujours sur `"light"` — il utilisera désormais le nouveau thème minimaliste.
- Le mode `"system"` continue de tomber sur `lightTheme` en mode clair OS — il bénéficiera automatiquement du nouveau thème.
- `ThemeMode` dans `types.ts` est déjà `string` — aucun changement.
- Le store `settings.ts` et le hook `useOrbParallax` ne sont pas modifiés.

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `src/theme/themes/ocean.ts` | Créer |
| `src/theme/themes/light.ts` | Remplacer |
| `src/theme/ThemeProvider.tsx` | Modifier (import + resolveTheme) |
| `src/components/layout/SettingsDialog.tsx` | Modifier (CUSTOM_THEMES + type) |
| `src/i18n/locales/fr.ts` | Modifier (clé ocean) |
| `src/i18n/locales/en.ts` | Modifier (clé ocean) |
