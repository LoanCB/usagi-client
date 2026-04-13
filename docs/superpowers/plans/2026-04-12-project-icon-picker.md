# Project Icon Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un sélecteur d'icône Lucide (12 icônes prédéfinies) dans le formulaire de projet, stocké comme nom string en DB, rendu dans la sidebar avec la couleur du projet.

**Architecture:** Mapping statique `PRESET_ICONS` dans `src/lib/icons.ts` (pattern identique à `src/lib/colors.ts`). `ProjectForm` ajoute un sélecteur visuel calqué sur le sélecteur de couleur. La sidebar résout le composant Lucide via ce mapping.

**Tech Stack:** React, TypeScript, lucide-react, Tailwind CSS

---

## Fichiers

- **Créer:** `src/lib/icons.ts` — mapping statique des 12 icônes Lucide
- **Modifier:** `src/components/projects/ProjectForm.tsx` — ajout état `icon` + section sélecteur
- **Modifier:** `src/components/layout/Sidebar.tsx` — rendu Lucide au lieu du span emoji

---

### Task 1: Créer `src/lib/icons.ts`

**Files:**
- Create: `src/lib/icons.ts`

- [ ] **Step 1: Créer le fichier avec le mapping des 12 icônes**

```ts
import {
  Folder,
  Code,
  BookOpen,
  Briefcase,
  Home,
  Star,
  Rocket,
  ShoppingCart,
  Wrench,
  Heart,
  Globe,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PresetIcon {
  name: string;
  icon: LucideIcon;
}

export const PRESET_ICONS: PresetIcon[] = [
  { name: "Folder", icon: Folder },
  { name: "Code", icon: Code },
  { name: "BookOpen", icon: BookOpen },
  { name: "Briefcase", icon: Briefcase },
  { name: "Home", icon: Home },
  { name: "Star", icon: Star },
  { name: "Rocket", icon: Rocket },
  { name: "ShoppingCart", icon: ShoppingCart },
  { name: "Wrench", icon: Wrench },
  { name: "Heart", icon: Heart },
  { name: "Globe", icon: Globe },
  { name: "Lightbulb", icon: Lightbulb },
];
```

- [ ] **Step 2: Vérifier que le build TypeScript passe**

```bash
pnpm tsc --noEmit
```

Attendu : aucune erreur.

---

### Task 2: Mettre à jour `ProjectForm` avec le sélecteur d'icône

**Files:**
- Modify: `src/components/projects/ProjectForm.tsx`

- [ ] **Step 1: Ajouter l'import et l'état `icon`**

En haut du fichier, ajouter l'import :

```ts
import { PRESET_ICONS } from "@/lib/icons";
```

Dans la fonction `ProjectForm`, ajouter l'état après `color` :

```ts
const [icon, setIcon] = useState(project?.icon ?? "Folder");
```

Dans `handleOpenChange`, réinitialiser l'état à l'ouverture :

```ts
setIcon(project?.icon ?? "Folder");
```

- [ ] **Step 2: Passer `icon` dans `handleSubmit`**

Remplacer les appels `createProject` / `updateProject` :

```ts
if (project) {
  await updateProject(repo, project.id, { name: name.trim(), color, icon });
} else {
  await createProject(repo, { name: name.trim(), color, icon });
}
```

- [ ] **Step 3: Ajouter la section sélecteur d'icône dans le JSX**

Insérer entre le `<Input>` et la section couleur :

```tsx
<div>
  <p className="text-xs text-muted-foreground mb-2">Icône</p>
  <div className="flex gap-2 flex-wrap">
    {PRESET_ICONS.map(({ name, icon: Icon }) => (
      <button
        key={name}
        type="button"
        className="h-7 w-7 rounded-md flex items-center justify-center transition-colors hover:bg-accent focus:outline-none"
        style={{
          outline: icon === name ? `2px solid ${color}` : undefined,
          outlineOffset: icon === name ? "2px" : undefined,
        }}
        aria-label={`Icône ${name}`}
        onClick={() => setIcon(name)}
      >
        <Icon className="h-4 w-4" />
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Vérifier que le build TypeScript passe**

```bash
pnpm tsc --noEmit
```

Attendu : aucune erreur.

---

### Task 3: Mettre à jour `Sidebar` pour rendre les icônes Lucide

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Ajouter l'import de `PRESET_ICONS`**

En haut du fichier, ajouter :

```ts
import { PRESET_ICONS } from "@/lib/icons";
```

- [ ] **Step 2: Remplacer le rendu de l'icône dans `ProjectNavItem`**

Remplacer le bloc `const icon = (...)` (lignes ~79-86) par :

```tsx
const iconDef = PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
const ProjectIcon = iconDef.icon;

const icon = (
  <ProjectIcon
    className="h-4 w-4 shrink-0"
    style={{ color: project.color ?? undefined }}
  />
);
```

- [ ] **Step 3: Vérifier que le build complet passe**

```bash
pnpm tsc --noEmit && pnpm build
```

Attendu : aucune erreur, build réussi.

- [ ] **Step 4: Vérifier visuellement dans l'app**

```bash
pnpm dev
```

Ouvrir l'app, créer un nouveau projet → le formulaire doit afficher :
- Section "Icône" avec 12 boutons Lucide
- L'icône sélectionnée reçoit un outline de la couleur du projet
- La sidebar affiche l'icône Lucide choisie avec la couleur du projet
- En mode édition, l'icône existante est pré-sélectionnée
