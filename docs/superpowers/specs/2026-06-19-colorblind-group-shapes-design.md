# Design : Formes daltonisme pour groupes de projets

**Date :** 2026-06-19  
**Statut :** Approuvé

## Contexte

Le mode daltonien (`colorblind_mode`) existe déjà dans Usagi et adapte l'affichage des priorités de tâches (points colorés → barres de hauteur variable, couleurs supprimées des tags et dates). Cependant, les groupes de projets dans la sidebar reposent encore uniquement sur la couleur pour se distinguer. Cette amélioration étend le mode daltonien aux groupes en associant une forme SVG distincte à chaque couleur.

## Objectif

En mode daltonien, chaque groupe de projets affiche sa couleur **et** une forme géométrique distinctive, permettant une identification sans ambiguïté même pour les utilisateurs ne distinguant pas les couleurs.

## Mapping couleurs → formes

10 formes pour 20 couleurs (2 couleurs par forme, groupées par catégorie existante) :

| Forme | ShapeId | Couleur 1 | Couleur 2 |
|-------|---------|-----------|-----------|
| Cercle plein | `circle` | `#ef4444` | `#f97316` |
| Carré | `square` | `#f59e0b` | `#eab308` |
| Triangle | `triangle` | `#84cc16` | `#22c55e` |
| Losange | `diamond` | `#10b981` | `#14b8a6` |
| Pentagone | `pentagon` | `#06b6d4` | `#3b82f6` |
| Hexagone | `hexagon` | `#6366f1` | `#8b5cf6` |
| Étoile | `star` | `#a855f7` | `#ec4899` |
| Croix | `cross` | `#f43f5e` | `#e11d48` |
| Flèche droite | `arrow` | `#64748b` | `#6b7280` |
| Goutte | `drop` | `#78716c` | `#d97706` |

## Architecture

### Nouveaux fichiers

**`src/lib/group-shapes.ts`**
- Type `ShapeId` : union des 10 identifiants de formes
- `COLOR_SHAPE_MAP: Record<string, ShapeId>` : mapping fixe couleur hex → forme
- `getShapeForColor(color: string): ShapeId` : retourne la forme, fallback `circle` si couleur inconnue
- `darkenColor(hex: string, amount: number): string` : assombrit une couleur hex de `amount` (0–1) via conversion HSL, utilisé pour le contour SVG

**`src/components/ui/GroupColorShape.tsx`**
- Props : `color: string`, `size?: number` (défaut `8`), `className?: string`
- Lit `colorblindMode` depuis `useSettingsStore`
- Mode normal : `<span>` cercle CSS (comportement identique à aujourd'hui)
- Mode daltonien : `<svg viewBox="0 0 10 10">` avec le path de la forme, `fill={color}`, `stroke={darkenColor(color, 0.2)}`, `strokeWidth="0.8"`, `aria-hidden="true"`
- Les 10 paths SVG sont définis dans le même fichier comme constantes

### Fichiers modifiés

**`src/components/layout/ProjectGroupNavItem.tsx`**
- Remplace `<span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />` par `<GroupColorShape color={group.color} size={8} className="shrink-0" />`
- Même remplacement dans le dialog d'édition inline (sélecteur de couleurs) : boutons `h-6 w-6 rounded-full` → `h-8 w-8` contenant `<GroupColorShape color={c} size={20} />`
- `aria-label` des boutons du sélecteur mis à jour : `${c} ${shapeId}` (nom de la forme en suffixe)

**`src/components/projects/CreateGroupDialog.tsx`**
- Même remplacement du sélecteur de couleurs que ci-dessus

### Pas de changement

- Store `settings.ts` : aucune nouvelle clé de setting
- Base de données : aucune migration
- Sidebar collapsée : le séparateur `h-0.5 rounded-full` reste inchangé (ce n'est pas un indicateur de groupe)

## Comportement du sélecteur de couleurs en mode daltonien

- Boutons `h-8 w-8` uniquement quand `colorblindMode === true` (au lieu de `h-6 w-6`) pour loger confortablement la forme ; en mode normal la taille reste `h-6 w-6`
- Fond du bouton transparent, la forme SVG est centrée
- Sélection active : `outline: 2px solid ${color}` avec `outlineOffset: 2px` (comportement existant conservé)

## Accessibilité

- SVGs dans `GroupColorShape` ont `aria-hidden="true"` — l'information est déjà portée par le texte du nom de groupe
- `aria-label` des boutons couleur dans les sélecteurs inclut le nom de la forme pour les lecteurs d'écran

## Périmètre hors-spec

- Pas de personnalisation de la forme par l'utilisateur (forme fixée par la couleur)
- Pas d'impact sur les priorités de tâches (déjà géré séparément)
- Pas de nouveaux thèmes ou palettes de couleurs
