# Colorblind Group Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En mode daltonien, chaque groupe de projets affiche sa couleur ET une forme géométrique SVG distinctive dans la sidebar et les sélecteurs de couleur.

**Architecture:** Un fichier `group-shapes.ts` définit le mapping fixe couleur→forme et une fonction utilitaire `darkenColor`. Un composant `GroupColorShape` encapsule le rendu (cercle CSS en mode normal, SVG en mode daltonien). Les deux composants existants (`ProjectGroupNavItem`, `CreateGroupDialog`) remplacent leurs cercles colorés par ce composant.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Zustand (`useSettingsStore`), SVG inline

**Forbidden** Write git commands (only read commands are authorized)

## Global Constraints

- Ne pas modifier le store `settings.ts` ni la base de données
- Le mode normal (colorblind OFF) doit rester visuellement identique à aujourd'hui
- Tous les fichiers de test sont dans `src/test/`
- Framework de test : Vitest + React Testing Library
- Les SVGs utilisent `viewBox="0 0 10 10"`
- Taille par défaut de `GroupColorShape` : `size=8` (sidebar), `size=20` (sélecteur)

---

### Task 1: group-shapes.ts — mapping et utilitaires

**Files:**

- Create: `src/lib/group-shapes.ts`
- Test: `src/test/group-shapes.test.ts`

**Interfaces:**

- Produces:
  - `type ShapeId = "circle" | "square" | "triangle" | "diamond" | "pentagon" | "hexagon" | "star" | "cross" | "arrow" | "drop"`
  - `COLOR_SHAPE_MAP: Record<string, ShapeId>` — 20 entrées
  - `getShapeForColor(color: string): ShapeId` — fallback `"circle"` si couleur inconnue
  - `darkenColor(hex: string, amount: number): string` — retourne un hex assombri

- [ ] **Step 1: Écrire les tests**

```typescript
// src/test/group-shapes.test.ts
import { describe, expect, it } from "vitest";
import {
  COLOR_SHAPE_MAP,
  darkenColor,
  getShapeForColor,
} from "@/lib/group-shapes";

describe("getShapeForColor", () => {
  it("retourne la forme associée à une couleur connue", () => {
    expect(getShapeForColor("#ef4444")).toBe("circle");
    expect(getShapeForColor("#f97316")).toBe("circle");
    expect(getShapeForColor("#f59e0b")).toBe("square");
    expect(getShapeForColor("#84cc16")).toBe("triangle");
    expect(getShapeForColor("#10b981")).toBe("diamond");
    expect(getShapeForColor("#06b6d4")).toBe("pentagon");
    expect(getShapeForColor("#6366f1")).toBe("hexagon");
    expect(getShapeForColor("#a855f7")).toBe("star");
    expect(getShapeForColor("#f43f5e")).toBe("cross");
    expect(getShapeForColor("#64748b")).toBe("arrow");
    expect(getShapeForColor("#78716c")).toBe("drop");
  });

  it("retourne 'circle' pour une couleur inconnue", () => {
    expect(getShapeForColor("#000000")).toBe("circle");
    expect(getShapeForColor("")).toBe("circle");
  });

  it("COLOR_SHAPE_MAP contient exactement 20 couleurs", () => {
    expect(Object.keys(COLOR_SHAPE_MAP)).toHaveLength(20);
  });
});

describe("darkenColor", () => {
  it("assombrit une couleur rouge", () => {
    const result = darkenColor("#ef4444", 0.2);
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result).not.toBe("#ef4444");
  });

  it("retourne la couleur inchangée si amount=0", () => {
    expect(darkenColor("#3b82f6", 0)).toBe("#3b82f6");
  });

  it("ne produit pas de valeurs négatives (clamp à 0)", () => {
    const result = darkenColor("#000000", 0.5);
    expect(result).toBe("#000000");
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
cd /home/loan/Projects/perso/usagi && npx vitest run src/test/group-shapes.test.ts
```

Attendu : FAIL — module `@/lib/group-shapes` introuvable

- [ ] **Step 3: Implémenter `src/lib/group-shapes.ts`**

```typescript
export type ShapeId =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "cross"
  | "arrow"
  | "drop";

export const COLOR_SHAPE_MAP: Record<string, ShapeId> = {
  // Reds / Oranges 1 → circle
  "#ef4444": "circle",
  "#f97316": "circle",
  // Reds / Oranges 2 → square
  "#f59e0b": "square",
  "#eab308": "square",
  // Greens 1 → triangle
  "#84cc16": "triangle",
  "#22c55e": "triangle",
  // Greens 2 → diamond
  "#10b981": "diamond",
  "#14b8a6": "diamond",
  // Blues 1 → pentagon
  "#06b6d4": "pentagon",
  "#3b82f6": "pentagon",
  // Blues 2 → hexagon
  "#6366f1": "hexagon",
  "#8b5cf6": "hexagon",
  // Purples / Pinks 1 → star
  "#a855f7": "star",
  "#ec4899": "star",
  // Purples / Pinks 2 → cross
  "#f43f5e": "cross",
  "#e11d48": "cross",
  // Neutrals 1 → arrow
  "#64748b": "arrow",
  "#6b7280": "arrow",
  // Neutrals 2 → drop
  "#78716c": "drop",
  "#d97706": "drop",
};

export function getShapeForColor(color: string): ShapeId {
  return COLOR_SHAPE_MAP[color] ?? "circle";
}

export function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Convertir RGB → HSL
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      case bn:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }

  l = Math.max(0, l - amount);

  // Convertir HSL → RGB
  function hue2rgb(p: number, q: number, t: number): number {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  }

  let rr: number;
  let gg: number;
  let bb: number;
  if (s === 0) {
    rr = gg = bb = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = hue2rgb(p, q, h + 1 / 3);
    gg = hue2rgb(p, q, h);
    bb = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
cd /home/loan/Projects/perso/usagi && npx vitest run src/test/group-shapes.test.ts
```

Attendu : PASS (tous les tests verts)

---

### Task 2: composant GroupColorShape

**Files:**

- Create: `src/components/ui/GroupColorShape.tsx`
- Test: `src/test/GroupColorShape.test.tsx`

**Interfaces:**

- Consumes:
  - `getShapeForColor(color: string): ShapeId` depuis `@/lib/group-shapes`
  - `darkenColor(hex: string, amount: number): string` depuis `@/lib/group-shapes`
  - `useSettingsStore((s) => s.colorblindMode)` depuis `@/store/settings`
- Produces:
  - `GroupColorShape({ color: string, size?: number, className?: string }): JSX.Element`

- [ ] **Step 1: Écrire les tests**

```typescript
// src/test/GroupColorShape.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { useSettingsStore } from "@/store/settings";

vi.mock("@/store/settings", () => ({
  useSettingsStore: vi.fn(),
}));

const mockSettings = useSettingsStore as ReturnType<typeof vi.fn>;

describe("GroupColorShape — mode normal", () => {
  it("rend un span cercle CSS avec la bonne couleur de fond", () => {
    mockSettings.mockReturnValue(false);
    const { container } = render(
      <GroupColorShape color="#ef4444" size={8} />
    );
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span?.style.backgroundColor).toBe("rgb(239, 68, 68)");
  });

  it("applique la className passée en prop", () => {
    mockSettings.mockReturnValue(false);
    const { container } = render(
      <GroupColorShape color="#3b82f6" className="shrink-0" />
    );
    expect(container.querySelector(".shrink-0")).toBeTruthy();
  });
});

describe("GroupColorShape — mode daltonien", () => {
  it("rend un svg avec aria-hidden", () => {
    mockSettings.mockReturnValue(true);
    const { container } = render(<GroupColorShape color="#ef4444" size={8} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("le svg a les bonnes dimensions", () => {
    mockSettings.mockReturnValue(true);
    const { container } = render(
      <GroupColorShape color="#3b82f6" size={20} />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("la forme fill correspond à la couleur passée", () => {
    mockSettings.mockReturnValue(true);
    const { container } = render(<GroupColorShape color="#84cc16" size={8} />);
    const path = container.querySelector("path, polygon, circle, rect");
    expect(path?.getAttribute("fill")).toBe("#84cc16");
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
cd /home/loan/Projects/perso/usagi && npx vitest run src/test/GroupColorShape.test.tsx
```

Attendu : FAIL — module introuvable

- [ ] **Step 3: Implémenter `src/components/ui/GroupColorShape.tsx`**

```typescript
import { cn } from "@/lib/utils";
import { darkenColor, getShapeForColor, type ShapeId } from "@/lib/group-shapes";
import { useSettingsStore } from "@/store/settings";

interface GroupColorShapeProps {
  color: string;
  size?: number;
  className?: string;
}

const SHAPE_PATHS: Record<ShapeId, React.ReactElement> = {
  circle: <circle cx="5" cy="5" r="4.5" />,
  square: <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />,
  triangle: <polygon points="5,0.5 9.5,9.5 0.5,9.5" />,
  diamond: <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />,
  pentagon: <polygon points="5,0.3 9.5,3.6 7.8,9.2 2.2,9.2 0.5,3.6" />,
  hexagon: <polygon points="5,0.3 9.2,2.6 9.2,7.4 5,9.7 0.8,7.4 0.8,2.6" />,
  star: (
    <polygon points="5,0.5 6.2,3.8 9.8,3.8 6.9,5.9 8,9.2 5,7.2 2,9.2 3.1,5.9 0.2,3.8 3.8,3.8" />
  ),
  cross: (
    <path d="M3.5,0.5 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z" />
  ),
  arrow: <polygon points="0.5,3.5 6,3.5 6,1 9.5,5 6,9 6,6.5 0.5,6.5" />,
  drop: <path d="M5,0.5 C5,0.5 9.5,5.5 9.5,7 A4.5,4.5 0 0,1 0.5,7 C0.5,5.5 5,0.5 5,0.5 Z" />,
};

export function GroupColorShape({
  color,
  size = 8,
  className,
}: GroupColorShapeProps) {
  const colorblindMode = useSettingsStore((s) => s.colorblindMode);

  if (!colorblindMode) {
    return (
      <span
        className={cn("rounded-full inline-block shrink-0", className)}
        style={{
          backgroundColor: color,
          width: size,
          height: size,
        }}
      />
    );
  }

  const shapeId = getShapeForColor(color);
  const stroke = darkenColor(color, 0.2);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
      style={{ display: "inline-block" }}
    >
      {React.cloneElement(SHAPE_PATHS[shapeId], {
        fill: color,
        stroke,
        strokeWidth: "0.8",
      })}
    </svg>
  );
}
```

Ajouter l'import React manquant en haut du fichier :

```typescript
import React from "react";
```

Le fichier complet avec imports :

```typescript
import React from "react";
import { cn } from "@/lib/utils";
import { darkenColor, getShapeForColor, type ShapeId } from "@/lib/group-shapes";
import { useSettingsStore } from "@/store/settings";

interface GroupColorShapeProps {
  color: string;
  size?: number;
  className?: string;
}

const SHAPE_PATHS: Record<ShapeId, React.ReactElement> = {
  circle: <circle cx="5" cy="5" r="4.5" />,
  square: <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />,
  triangle: <polygon points="5,0.5 9.5,9.5 0.5,9.5" />,
  diamond: <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />,
  pentagon: <polygon points="5,0.3 9.5,3.6 7.8,9.2 2.2,9.2 0.5,3.6" />,
  hexagon: <polygon points="5,0.3 9.2,2.6 9.2,7.4 5,9.7 0.8,7.4 0.8,2.6" />,
  star: (
    <polygon points="5,0.5 6.2,3.8 9.8,3.8 6.9,5.9 8,9.2 5,7.2 2,9.2 3.1,5.9 0.2,3.8 3.8,3.8" />
  ),
  cross: (
    <path d="M3.5,0.5 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z" />
  ),
  arrow: <polygon points="0.5,3.5 6,3.5 6,1 9.5,5 6,9 6,6.5 0.5,6.5" />,
  drop: <path d="M5,0.5 C5,0.5 9.5,5.5 9.5,7 A4.5,4.5 0 0,1 0.5,7 C0.5,5.5 5,0.5 5,0.5 Z" />,
};

export function GroupColorShape({
  color,
  size = 8,
  className,
}: GroupColorShapeProps) {
  const colorblindMode = useSettingsStore((s) => s.colorblindMode);

  if (!colorblindMode) {
    return (
      <span
        className={cn("rounded-full inline-block shrink-0", className)}
        style={{
          backgroundColor: color,
          width: size,
          height: size,
        }}
      />
    );
  }

  const shapeId = getShapeForColor(color);
  const stroke = darkenColor(color, 0.2);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
      style={{ display: "inline-block" }}
    >
      {React.cloneElement(SHAPE_PATHS[shapeId], {
        fill: color,
        stroke,
        strokeWidth: "0.8",
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
cd /home/loan/Projects/perso/usagi && npx vitest run src/test/GroupColorShape.test.tsx
```

Attendu : PASS

---

### Task 3: Intégration dans ProjectGroupNavItem

**Files:**

- Modify: `src/components/layout/ProjectGroupNavItem.tsx`

**Interfaces:**

- Consumes:
  - `GroupColorShape({ color, size, className })` depuis `@/components/ui/GroupColorShape`
  - `getShapeForColor(color: string): ShapeId` depuis `@/lib/group-shapes` (pour les aria-labels)

- [ ] **Step 1: Remplacer le cercle dans le header du groupe**

Dans `ProjectGroupNavItem.tsx`, ligne ~115, remplacer :

```tsx
<span
  className="h-2 w-2 rounded-full shrink-0"
  style={{ backgroundColor: group.color }}
/>
```

par :

```tsx
<GroupColorShape color={group.color} size={8} className="shrink-0" />
```

Ajouter l'import en haut du fichier :

```tsx
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { getShapeForColor } from "@/lib/group-shapes";
```

- [ ] **Step 2: Remplacer le sélecteur de couleurs dans le dialog d'édition**

Dans `ProjectGroupNavItem.tsx`, le bloc du sélecteur (lignes ~158–174) :

Remplacer :

```tsx
<div className="flex gap-2 flex-wrap">
  {GROUP_COLORS.map((c) => (
    <button
      key={c}
      type="button"
      onClick={() => setEditColor(c)}
      className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
      style={{
        backgroundColor: c,
        outline: editColor === c ? `2px solid ${c}` : undefined,
        outlineOffset: editColor === c ? "2px" : undefined,
      }}
      aria-label={c}
    />
  ))}
</div>
```

par :

```tsx
<ColorPicker
  colors={GROUP_COLORS}
  selectedColor={editColor}
  onSelect={setEditColor}
/>
```

Et définir `ColorPicker` comme composant local dans le même fichier (avant le composant principal) :

```tsx
import { useSettingsStore } from "@/store/settings";

function ColorPicker({
  colors,
  selectedColor,
  onSelect,
}: {
  colors: readonly string[];
  selectedColor: string;
  onSelect: (color: string) => void;
}) {
  const colorblindMode = useSettingsStore((s) => s.colorblindMode);
  const btnSize = colorblindMode ? "h-8 w-8" : "h-6 w-6";

  return (
    <div className="flex gap-2 flex-wrap">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className={`${btnSize} flex items-center justify-center transition-transform hover:scale-110 focus:outline-none rounded-full`}
          style={{
            outline: selectedColor === c ? `2px solid ${c}` : undefined,
            outlineOffset: selectedColor === c ? "2px" : undefined,
          }}
          aria-label={colorblindMode ? `${c} ${getShapeForColor(c)}` : c}
        >
          <GroupColorShape color={c} size={colorblindMode ? 20 : 16} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Vérifier que les tests existants passent**

```bash
cd /home/loan/Projects/perso/usagi && npx vitest run src/test/Sidebar.test.tsx
```

Attendu : PASS (aucune régression)

---

### Task 4: Intégration dans CreateGroupDialog

**Files:**

- Modify: `src/components/projects/CreateGroupDialog.tsx`

**Interfaces:**

- Consumes:
  - `GroupColorShape({ color, size, className })` depuis `@/components/ui/GroupColorShape`
  - `getShapeForColor(color: string): ShapeId` depuis `@/lib/group-shapes`
  - `useSettingsStore((s) => s.colorblindMode)` depuis `@/store/settings`

- [ ] **Step 1: Extraire et réutiliser ColorPicker**

Le composant `ColorPicker` défini dans la Task 3 doit être partagé. Le déplacer dans `src/components/ui/ColorPicker.tsx` plutôt que de le dupliquer.

Créer `src/components/ui/ColorPicker.tsx` :

```tsx
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { getShapeForColor } from "@/lib/group-shapes";
import { useSettingsStore } from "@/store/settings";

interface ColorPickerProps {
  colors: readonly string[];
  selectedColor: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({
  colors,
  selectedColor,
  onSelect,
}: ColorPickerProps) {
  const colorblindMode = useSettingsStore((s) => s.colorblindMode);
  const btnSize = colorblindMode ? "h-8 w-8" : "h-6 w-6";

  return (
    <div className="flex gap-2 flex-wrap">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className={`${btnSize} flex items-center justify-center transition-transform hover:scale-110 focus:outline-none rounded-full`}
          style={{
            outline: selectedColor === c ? `2px solid ${c}` : undefined,
            outlineOffset: selectedColor === c ? "2px" : undefined,
          }}
          aria-label={colorblindMode ? `${c} ${getShapeForColor(c)}` : c}
        >
          <GroupColorShape color={c} size={colorblindMode ? 20 : 16} />
        </button>
      ))}
    </div>
  );
}
```

**Mettre à jour `ProjectGroupNavItem.tsx`** pour importer `ColorPicker` depuis `@/components/ui/ColorPicker` au lieu de le définir localement (supprimer la définition locale ajoutée en Task 3).

- [ ] **Step 2: Intégrer ColorPicker dans CreateGroupDialog**

Dans `CreateGroupDialog.tsx`, remplacer :

```tsx
<div className="flex gap-2 flex-wrap">
  {GROUP_COLORS.map((c) => (
    <button
      key={c}
      type="button"
      onClick={() => setColor(c)}
      className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1"
      style={{
        backgroundColor: c,
        outline: color === c ? `2px solid ${c}` : undefined,
        outlineOffset: color === c ? "2px" : undefined,
      }}
      aria-label={c}
    />
  ))}
</div>
```

par :

```tsx
<ColorPicker colors={GROUP_COLORS} selectedColor={color} onSelect={setColor} />
```

Ajouter les imports nécessaires :

```tsx
import { ColorPicker } from "@/components/ui/ColorPicker";
```

Supprimer les imports devenus inutiles dans `CreateGroupDialog.tsx` si nécessaire.

- [ ] **Step 3: Vérifier que tous les tests passent**

```bash
cd /home/loan/Projects/perso/usagi && npx vitest run
```

Attendu : PASS (tous les tests, sans régression)
