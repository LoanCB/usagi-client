# Rich Text — Amélioration UX de la création de lien

**Date :** 2026-05-19  
**Fichier concerné :** `src/components/tasks/RichTextToolbar.tsx`

---

## Contexte

Le rich text editor utilise [Tiptap](https://tiptap.dev/) avec l'extension `Link`. Actuellement, le popover de création de lien ne contient qu'un seul input (URL). L'utilisateur doit d'abord taper son texte dans l'éditeur, le sélectionner, puis ajouter le lien. Il n'est pas possible de saisir texte et URL en une seule étape.

---

## Objectif

Améliorer l'UX en permettant de saisir le texte et l'URL du lien dans le même popover, en une seule interaction.

---

## Comportement cible

### Ouverture du popover

- Si un lien est déjà actif sur la sélection → comportement inchangé : clic supprime le lien (`unsetLink`), popover ne s'ouvre pas.
- Sinon → le popover s'ouvre avec :
  - **Champ URL** : vide, autofocus
  - **Champ texte** : pré-rempli avec le texte sélectionné dans l'éditeur (via `editor.state.doc.textBetween(from, to)`), ou vide si aucune sélection

### Soumission

1. Si l'URL est vide → ferme le popover sans action
2. `textToInsert = linkText.trim() || url`
3. Insère dans l'éditeur :
   ```ts
   editor
     .chain()
     .focus()
     .insertContent({
       type: "text",
       text: textToInsert,
       marks: [{ type: "link", attrs: { href: url } }],
     })
     .run();
   ```
4. Reset des états `linkUrl` et `linkText`, fermeture du popover

### Layout du popover

```
┌─────────────────────────────────┐
│ https://...                     │  ← URL (required, autoFocus)
│ Texte du lien (facultatif)      │  ← Text (optional)
│                             [OK]│
└─────────────────────────────────┘
```

- Largeur : `w-80` (au lieu de `w-72`)
- Direction : `flex-col gap-2` (au lieu de `flex gap-2` horizontal)
- Bouton OK aligné à droite en bas

---

## Changements dans le code

### États ajoutés

```ts
const [linkText, setLinkText] = useState("");
```

### `handleLinkButtonClick` modifié

```ts
function handleLinkButtonClick(e: React.MouseEvent) {
  if (editor.isActive("link")) {
    e.preventDefault();
    editor.chain().focus().unsetLink().run();
  } else {
    const { from, to } = editor.state.selection;
    setLinkText(editor.state.doc.textBetween(from, to));
    setLinkUrl("");
  }
}
```

### `handleLinkSubmit` modifié

```ts
function handleLinkSubmit() {
  const url = linkUrl.trim();
  if (url) {
    const text = linkText.trim() || url;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text,
        marks: [{ type: "link", attrs: { href: url } }],
      })
      .run();
  }
  setLinkOpen(false);
  setLinkUrl("");
  setLinkText("");
}
```

### JSX du popover modifié

- `PopoverContent` : `w-80 p-2`
- `form` : `flex flex-col gap-2`
- Second `Input` pour le texte : `placeholder="Texte du lien (facultatif)"`
- `Button` OK : `self-end`

---

## Ce qui ne change pas

- La logique de toggle (suppression du lien si déjà actif)
- L'autolink Tiptap (liens détectés automatiquement à la frappe)
- L'ouverture des liens via `openUrl` (Tauri)
- Tous les autres boutons de la toolbar
