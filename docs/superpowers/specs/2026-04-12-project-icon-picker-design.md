# Design : Sélecteur d'icône pour les projets

**Date :** 2026-04-12  
**Statut :** Approuvé

---

## Contexte

Le type `Project` possède déjà un champ `icon: string | null` en base de données et dans les types TypeScript. La `Sidebar` affiche déjà l'icône avec un fallback emoji `📁`. Il manque uniquement l'UI permettant à l'utilisateur de choisir une icône lors de la création ou modification d'un projet.

---

## Approche retenue

**Mapping statique de noms d'icônes Lucide** — un fichier `src/lib/icons.ts` contient un tableau de ~12 icônes avec leur nom string et leur composant Lucide. Le nom string est stocké en DB ; le composant est résolu au rendu via une recherche dans ce tableau.

---

## Fichiers à créer / modifier

### `src/lib/icons.ts` (nouveau)

Tableau `PRESET_ICONS` exporté, chaque entrée `{ name: string, icon: LucideIcon }` :

- Folder, Code, BookOpen, Briefcase, Home, Star
- Rocket, ShoppingCart, Wrench, Heart, Globe, Lightbulb

```ts
export type PresetIcon = typeof PRESET_ICONS[number]
```

### `src/components/projects/ProjectForm.tsx` (modifié)

- Ajout d'un état local `icon` initialisé à `"Folder"` (ou `project.icon` en mode édition).
- Section "Icône" ajoutée dans le formulaire, entre le nom et la couleur, avec une grille de boutons calquée sur le sélecteur de couleur existant.
- Chaque bouton affiche `<IconComponent className="h-4 w-4" />` et reçoit un outline de sélection identique aux swatches de couleur.
- `handleSubmit` passe `icon: selectedIconName` dans `createProject` / `updateProject`.

### `src/components/layout/Sidebar.tsx` (modifié)

Dans `ProjectNavItem`, remplacer le span avec emoji par :

```tsx
const iconDef = PRESET_ICONS.find(i => i.name === project.icon) ?? PRESET_ICONS[0]
const IconComponent = iconDef.icon
// <IconComponent className="h-4 w-4 shrink-0" style={{ color: project.color ?? undefined }} />
```

L'icône hérite de la couleur du projet.

---

## Stockage

- Le champ `icon` en DB stocke le `name` string (`"Folder"`, `"Rocket"`, etc.).
- Pas de migration nécessaire : le champ existe déjà, `null` est géré par le fallback vers `PRESET_ICONS[0]`.

---

## Ce qui n'est pas dans le scope

- Recherche/filtre d'icônes (liste fixe de 12, pas besoin)
- Icônes personnalisées (upload, URL)
- Internationalisation des labels d'icônes (aria-label en français suffit)
