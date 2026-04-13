# Design : Rich text editor pour la note de tâche

**Date :** 2026-04-13  
**Statut :** Approuvé

## Problème

Le champ description des tâches est un `<textarea>` plain text. L'utilisateur veut pouvoir mettre en forme ses notes (gras, italique, titres, listes, checklist, code, liens).

## Solution retenue : Tiptap WYSIWYG + barre fixe + raccourcis markdown

### Bibliothèque

**Tiptap** (basé sur ProseMirror). Choisi pour :
- Support natif des 6 fonctionnalités demandées via extensions modulaires
- Raccourcis markdown input rules intégrés (taper `**` → gras, `# ` → H1, `- ` → liste, etc.)
- API React simple, bien adaptée à un composant isolé

### Fonctionnalités activées

| Fonctionnalité | Extension Tiptap |
|---|---|
| Gras / Italique | `StarterKit` (Bold, Italic) |
| Titres H1 / H2 / H3 | `StarterKit` (Heading) |
| Liste à puces / numérotée | `StarterKit` (BulletList, OrderedList) |
| Checklist interactive | `TaskList` + `TaskItem` |
| Code inline / bloc | `StarterKit` (Code, CodeBlock) |
| Liens cliquables | `Link` (avec auto-détection) |
| Raccourcis markdown | Activés via `inputRules` de StarterKit |

### Composants créés

**`src/components/tasks/RichTextEditor.tsx`**  
Composant isolé qui encapsule Tiptap. Interface :
```ts
interface RichTextEditorProps {
  value: string        // HTML string (lu depuis task.description)
  onChange: (html: string) => void
  onBlur: () => void
  placeholder?: string
}
```
- Initialise l'éditeur avec `content: value`
- Appelle `onChange` à chaque modification (`onUpdate`)
- Appelle `onBlur` à la perte de focus (`onBlur`)
- Inclut la toolbar et l'éditeur dans le même composant

**`src/components/tasks/RichTextToolbar.tsx`**  
Barre fixe au-dessus de l'éditeur. Boutons : B / I / H1 / H2 / H3 / liste à puces / liste numérotée / checklist / code / lien. Chaque bouton est actif (highlight) quand le curseur est positionné sur le format correspondant (`editor.isActive(...)`).

### Modification dans TaskDetail

[`src/components/layout/TaskDetail.tsx`] : remplacer le `<textarea>` et le `useRef` auto-grow par `<RichTextEditor>`. La logique `handleDescriptionBlur` et `handleDescriptionChange` reste identique.

### Stockage

Contenu stocké en **HTML** dans la colonne `description TEXT` existante (SQLite). Aucune migration SQL nécessaire. Les notes existantes en plain text s'affichent correctement (HTML valide minimal).

### Style

- La toolbar adopte le thème existant (variables CSS `--border`, `--accent`, `--foreground`, etc.)
- L'éditeur hérite du style du textarea actuel (`text-sm`, `text-muted-foreground`, fond transparent)
- Pas de border autour de l'éditeur — cohérence avec le design actuel

### Ce qui ne change pas

- Logique de sauvegarde (`onBlur` → `updateTask`)
- Colonne SQL `description`
- Structure du panneau `TaskDetail`
- Aucun autre composant affecté
