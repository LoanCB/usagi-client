# Design : Note de tâche auto-grow + resize manuel

**Date :** 2026-04-13  
**Statut :** Approuvé

## Problème

Le textarea de description dans `TaskDetail` est fixé à `rows={3}` avec `resize-none`. Quand une note est longue, l'utilisateur ne voit pas le contenu sans scroller à l'intérieur du champ, ce qui est peu pratique.

## Solution retenue : Auto-grow + resize manuel (Option C)

### Comportement

- Le textarea s'agrandit automatiquement pour afficher tout son contenu sans scroll interne.
- L'utilisateur peut également tirer la poignée de redimensionnement en bas du textarea pour ajuster manuellement la hauteur.
- Hauteur minimale de `72px` (~3 lignes) pour ne pas avoir un champ vide trop petit.
- Pas de hauteur maximale — la note prend l'espace naturellement.

### Implémentation

**Fichier :** `src/components/layout/TaskDetail.tsx`

**Changements :**

1. Ajouter une `ref` sur le textarea (`useRef<HTMLTextAreaElement>(null)`).
2. Ajouter un `useEffect` qui, à chaque changement de `description`, remet la hauteur à `auto` puis la fixe à `scrollHeight` — ce pattern force le recalcul correct après suppression de texte.
3. Remplacer `resize-none` par `resize-y` dans les classes Tailwind.
4. Remplacer `rows={3}` par `style` géré dynamiquement (ou conserver `rows={3}` comme fallback pour le rendu initial avant le premier effet).
5. Ajouter `min-h-[72px]` et `overflow-hidden` (pour éviter la scrollbar flash pendant le recalcul).

### Ce qui ne change pas

- Logique `onBlur` et sauvegarde (`handleDescriptionBlur`)
- Structure du panneau (`TaskDetail`)
- Aucun autre composant affecté
