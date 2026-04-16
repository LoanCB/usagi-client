// src/components/tasks/RichTextToolbar.tsx
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import "@tiptap/starter-kit";
import "@tiptap/extension-link";
import "@tiptap/extension-task-list";

interface RichTextToolbarProps {
  readonly editor: Editor;
}

interface ToolbarButton {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  action: () => void;
}

export function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

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
  ];

  function handleLinkSubmit() {
    const url = linkUrl.trim();
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  }

  function handleLinkButtonClick(e: React.MouseEvent) {
    if (editor.isActive("link")) {
      e.preventDefault(); // prevents Radix from opening the popover
      editor.chain().focus().unsetLink().run();
    } else {
      setLinkUrl("");
    }
  }

  return (
    <div className="flex flex-wrap gap-0.5 p-1 border-b border-border">
      {buttons.map((btn) => (
        <Tooltip key={btn.label}>
          <TooltipTrigger
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              btn.action();
            }}
            aria-label={btn.label}
            className={cn(
              "p-1.5 rounded transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              btn.isActive && "text-foreground bg-accent"
            )}
          >
            {btn.icon}
          </TooltipTrigger>
          <TooltipContent>{btn.label}</TooltipContent>
        </Tooltip>
      ))}

      {/* Link button with popover */}
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <Tooltip>
          <TooltipTrigger render={
            <PopoverTrigger
              type="button"
              onClick={handleLinkButtonClick}
              aria-label="Lien"
              className={cn(
                "p-1.5 rounded transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                editor.isActive("link") && "text-foreground bg-accent"
              )}
            />
          }>
            <Link className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent>Lien</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-72 p-2">
          <form
            onSubmit={(e) => { e.preventDefault(); handleLinkSubmit(); }}
            className="flex gap-2"
          >
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="h-7 text-sm"
              autoFocus
            />
            <Button type="submit" size="sm" className="h-7 px-2 text-xs">
              OK
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
