# Rich Text Note Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le textarea plain text de la note de tâche par un éditeur rich text Tiptap avec barre d'outils fixe et raccourcis markdown.

**Architecture:** Un composant `RichTextEditor` encapsule Tiptap et expose la même interface que le textarea actuel (`value`, `onChange`, `onBlur`). Un sous-composant `RichTextToolbar` affiche les boutons de formatage. `TaskDetail` est modifié pour utiliser `RichTextEditor` à la place du textarea.

**Tech Stack:** Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-link`), React 19, Tailwind CSS v4, Lucide React

---

## File Map

| Fichier | Action | Responsabilité |
|---|---|---|
| `src/components/tasks/RichTextToolbar.tsx` | Créer | Barre de boutons de formatage, reçoit `editor` en prop |
| `src/components/tasks/RichTextEditor.tsx` | Créer | Composant Tiptap complet (toolbar + éditeur), interface identique au textarea |
| `src/components/layout/TaskDetail.tsx` | Modifier | Remplacer `<textarea>` + `useRef` auto-grow par `<RichTextEditor>` |
| `src/index.css` | Modifier | Ajouter styles pour le contenu Tiptap (listes, titres, checklist, code) |

---

### Task 1 : Installer les dépendances Tiptap

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1 : Installer les packages**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-link
```

Expected output: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2 : Vérifier l'installation**

```bash
npm ls @tiptap/react @tiptap/starter-kit
```

Expected: les versions s'affichent sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tiptap dependencies"
```

---

### Task 2 : Créer RichTextToolbar

**Files:**
- Create: `src/components/tasks/RichTextToolbar.tsx`

- [ ] **Step 1 : Créer le fichier**

```tsx
// src/components/tasks/RichTextToolbar.tsx
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Code,
  Link,
} from "lucide-react";

interface RichTextToolbarProps {
  editor: Editor;
}

interface ToolbarButton {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  action: () => void;
}

export function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const buttons: ToolbarButton[] = [
    {
      label: "Gras",
      icon: <Bold className="h-3.5 w-3.5" />,
      isActive: editor.isActive("bold"),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italique",
      icon: <Italic className="h-3.5 w-3.5" />,
      isActive: editor.isActive("italic"),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Titre 1",
      icon: <Heading1 className="h-3.5 w-3.5" />,
      isActive: editor.isActive("heading", { level: 1 }),
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Titre 2",
      icon: <Heading2 className="h-3.5 w-3.5" />,
      isActive: editor.isActive("heading", { level: 2 }),
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Titre 3",
      icon: <Heading3 className="h-3.5 w-3.5" />,
      isActive: editor.isActive("heading", { level: 3 }),
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Liste à puces",
      icon: <List className="h-3.5 w-3.5" />,
      isActive: editor.isActive("bulletList"),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Liste numérotée",
      icon: <ListOrdered className="h-3.5 w-3.5" />,
      isActive: editor.isActive("orderedList"),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Checklist",
      icon: <ListChecks className="h-3.5 w-3.5" />,
      isActive: editor.isActive("taskList"),
      action: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Code",
      icon: <Code className="h-3.5 w-3.5" />,
      isActive: editor.isActive("code") || editor.isActive("codeBlock"),
      action: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Lien",
      icon: <Link className="h-3.5 w-3.5" />,
      isActive: editor.isActive("link"),
      action: () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          const url = window.prompt("URL du lien :");
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }
      },
    },
  ];

  return (
    <div className="flex flex-wrap gap-0.5 p-1 border-b border-border">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          onClick={btn.action}
          aria-label={btn.label}
          className={cn(
            "p-1.5 rounded transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            btn.isActive && "text-foreground bg-accent"
          )}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/tasks/RichTextToolbar.tsx
git commit -m "feat: add RichTextToolbar component"
```

---

### Task 3 : Créer RichTextEditor

**Files:**
- Create: `src/components/tasks/RichTextEditor.tsx`

- [ ] **Step 1 : Créer le fichier**

```tsx
// src/components/tasks/RichTextEditor.tsx
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { RichTextToolbar } from "./RichTextToolbar";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur: () => void;
  placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: true, autolink: true }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    onBlur() {
      onBlur();
    },
    editorProps: {
      attributes: {
        class:
          "tiptap focus:outline-none text-sm text-muted-foreground focus:text-foreground min-h-[72px] px-4 py-3",
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  // Sync value when task changes (new task selected)
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    if (currentHTML !== value) {
      editor.commands.setContent(value ?? "", false);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="border-b border-border">
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/tasks/RichTextEditor.tsx
git commit -m "feat: add RichTextEditor component with Tiptap"
```

---

### Task 4 : Ajouter les styles CSS pour le contenu Tiptap

**Files:**
- Modify: `src/index.css`

Les extensions Tiptap génèrent des éléments HTML (`<ul>`, `<ol>`, `<h1>`–`<h3>`, `<input type="checkbox">`, `<code>`, `<pre>`, `<a>`) qui n'ont aucun style par défaut avec Tailwind (preflight reset). Il faut les styliser.

- [ ] **Step 1 : Ajouter les styles à la fin de `src/index.css`**

```css
/* ── Tiptap rich text editor ───────────────────────────────── */
.tiptap {
  /* Placeholder */
  &:empty::before {
    content: attr(data-placeholder);
    color: var(--muted-foreground);
    opacity: 0.5;
    pointer-events: none;
    float: left;
    height: 0;
  }

  /* Headings */
  h1 { font-size: 1.25rem; font-weight: 700; margin: 0.75em 0 0.25em; }
  h2 { font-size: 1.1rem; font-weight: 600; margin: 0.5em 0 0.25em; }
  h3 { font-size: 1rem; font-weight: 600; margin: 0.5em 0 0.25em; }

  /* Paragraphe */
  p { margin: 0.25em 0; }

  /* Listes */
  ul, ol { padding-left: 1.25rem; margin: 0.25em 0; }
  ul { list-style-type: disc; }
  ol { list-style-type: decimal; }
  li { margin: 0.1em 0; }

  /* Checklist */
  ul[data-type="taskList"] {
    list-style: none;
    padding-left: 0;

    li {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;

      > label {
        flex-shrink: 0;
        margin-top: 0.15rem;
        input[type="checkbox"] {
          width: 0.875rem;
          height: 0.875rem;
          cursor: pointer;
          accent-color: var(--primary);
        }
      }

      > div { flex: 1; }

      &[data-checked="true"] > div {
        text-decoration: line-through;
        color: var(--muted-foreground);
      }
    }
  }

  /* Code inline */
  code:not(pre code) {
    background: var(--muted);
    border-radius: 0.25rem;
    padding: 0.1em 0.35em;
    font-family: monospace;
    font-size: 0.85em;
  }

  /* Bloc de code */
  pre {
    background: var(--muted);
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    margin: 0.5em 0;
    overflow-x: auto;

    code {
      font-family: monospace;
      font-size: 0.85em;
      background: none;
      padding: 0;
    }
  }

  /* Liens */
  a {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
}
```

- [ ] **Step 2 : Commit**

```bash
git add src/index.css
git commit -m "feat: add tiptap editor styles"
```

---

### Task 5 : Intégrer RichTextEditor dans TaskDetail

**Files:**
- Modify: `src/components/layout/TaskDetail.tsx`

- [ ] **Step 1 : Remplacer le textarea par RichTextEditor**

Remplacer le contenu de [TaskDetail.tsx](src/components/layout/TaskDetail.tsx) par :

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Trash2, CheckCircle, Circle } from "lucide-react";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { PrioritySelector } from "@/components/tasks/PrioritySelector";
import { DueDatePicker } from "@/components/tasks/DueDatePicker";
import { TagSelector } from "@/components/tasks/TagSelector";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import type { Priority } from "@/types";

export function TaskDetail() {
  const { tasks, updateTask, completeTask, uncompleteTask, deleteTask } =
    useTaskStore();
  const { selectedTaskId, setSelectedTask } = useUIStore();
  const { t } = useTranslation();

  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
  }, [task?.id]);

  if (!task) return null;

  const repo = getRepository();
  const taskId = task.id;

  async function handleTitleBlur() {
    if (title.trim() && title !== task!.title) {
      await updateTask(repo, taskId, { title: title.trim() });
    }
  }

  async function handleDescriptionBlur() {
    const value = description.trim();
    const stored = task!.description ?? "";
    if (value !== stored) {
      await updateTask(repo, taskId, { description: value || null });
    }
  }

  async function handlePriorityChange(priority: Priority) {
    await updateTask(repo, taskId, { priority });
  }

  async function handleDateChange(dueDate: string | null) {
    await updateTask(repo, taskId, { dueDate });
  }

  async function handleTagsChange(tagIds: string[]) {
    await updateTask(repo, taskId, { tagIds });
  }

  async function handleToggleComplete() {
    if (task!.completedAt) await uncompleteTask(repo, taskId);
    else await completeTask(repo, taskId);
  }

  async function handleDelete() {
    await deleteTask(repo, taskId);
    setSelectedTask(null);
  }

  return (
    <div className="w-80 shrink-0 flex flex-col h-full border-l border-border bg-card">
      {/* Complete / title */}
      <div className="flex items-start gap-3 p-4 border-b border-border">
        <button
          onClick={handleToggleComplete}
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={task.completedAt ? t('task.markIncomplete') : t('task.markComplete')}
        >
          {task.completedAt ? (
            <CheckCircle className="h-5 w-5 text-[var(--priority-low)]" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.target as HTMLInputElement).blur()
          }
          className="border-none shadow-none p-0 text-base font-medium focus-visible:ring-0 bg-transparent"
          placeholder={t('task.titlePlaceholder')}
        />
      </div>

      {/* Description rich text */}
      <RichTextEditor
        value={description}
        onChange={setDescription}
        onBlur={handleDescriptionBlur}
        placeholder={t('task.descriptionPlaceholder')}
      />

      {/* Metadata */}
      <div className="flex flex-col gap-1 p-3 border-b border-border">
        <PrioritySelector
          value={task.priority}
          onChange={handlePriorityChange}
        />
        <DueDatePicker value={task.dueDate} onChange={handleDateChange} />
        <TagSelector
          selectedTagIds={task.tags.map((t) => t.id)}
          onChange={handleTagsChange}
        />
      </div>

      {/* Actions */}
      <div className="p-3 mt-auto">
        <Separator className="mb-3" />
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive w-full justify-start"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          {t('task.delete')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
npm run build
```

Expected: compilation sans erreur TypeScript.

- [ ] **Step 3 : Commit**

```bash
git add src/components/layout/TaskDetail.tsx
git commit -m "feat: replace textarea with RichTextEditor in TaskDetail"
```

---

### Task 6 : Test manuel et vérification finale

**Files:** aucun fichier modifié — vérification uniquement

- [ ] **Step 1 : Lancer l'app en dev**

```bash
npm run dev
```

- [ ] **Step 2 : Vérifier les comportements suivants**

1. Ouvrir une tâche → la toolbar apparaît au-dessus du champ note
2. Taper du texte → le bouton B actif quand le curseur est en gras
3. Sélectionner du texte → clic B → texte en gras
4. Taper `**mot**` → "mot" devient gras à la frappe (markdown shortcut)
5. Taper `# ` en début de ligne → devient un titre H1
6. Taper `- ` en début de ligne → devient une liste à puces
7. Cliquer le bouton checklist → liste de cases à cocher créée, les cases sont cochables
8. Cliquer le bouton lien → prompt URL → lien inséré et cliquable
9. Naviguer vers une autre tâche et revenir → le contenu est bien rechargé
10. Modifier la note et cliquer ailleurs → la note est sauvegardée (vérifier en rechargeant l'app)

- [ ] **Step 3 : Vérifier le build de production**

```bash
npm run build
```

Expected: build sans erreur.
