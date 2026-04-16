import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { RichTextToolbar } from "./RichTextToolbar";

interface RichTextEditorProps {
  readonly value: string;
  readonly onChange: (html: string) => void;
  readonly onBlur: () => void;
  readonly placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

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
      onChangeRef.current(editor.getHTML());
    },
    onBlur() {
      onBlurRef.current();
    },
    editorProps: {
      attributes: {
        class:
          "tiptap focus:outline-none text-sm text-muted-foreground focus:text-foreground min-h-[72px] grow px-4 py-3",
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  // Sync value when task changes (new task selected)
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    if (currentHTML !== value) {
      editor.commands.setContent(value ?? "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col border-b border-border">
      <div className="sticky top-0 bg-card z-10">
        <RichTextToolbar editor={editor} />
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 flex flex-col">
        <EditorContent editor={editor} className="flex-1 flex flex-col" />
      </div>
    </div>
  );
}
