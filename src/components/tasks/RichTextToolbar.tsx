// src/components/tasks/RichTextToolbar.tsx
import type { Editor } from "@tiptap/react";
import {
	Bold,
	Code,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link,
	List,
	ListChecks,
	ListOrdered,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
	const [linkText, setLinkText] = useState("");

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
			const text = linkText.trim() || url;
			editor
				.chain()
				.focus()
				.insertContent({
					type: "text",
					text,
					marks: [{ type: "link", attrs: { href: url } }],
				})
				.command(({ tr, dispatch }) => {
					if (dispatch) {
						const linkType = editor.schema.marks.link;
						if (linkType) {
							const current = tr.storedMarks ?? tr.selection.$head.marks();
							tr.setStoredMarks(current.filter((m) => m.type !== linkType));
						}
					}
					return true;
				})
				.run();
		}
		setLinkOpen(false);
		setLinkUrl("");
		setLinkText("");
	}

	function handleLinkButtonClick(e: React.MouseEvent) {
		if (editor.isActive("link")) {
			e.preventDefault(); // prevents Radix from opening the popover
			editor.chain().focus().unsetLink().run();
		} else {
			const { from, to } = editor.state.selection;
			setLinkText(editor.state.doc.textBetween(from, to));
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
							btn.isActive && "text-foreground bg-accent",
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
					<TooltipTrigger
						render={
							<PopoverTrigger
								type="button"
								onClick={handleLinkButtonClick}
								aria-label="Lien"
								className={cn(
									"p-1.5 rounded transition-colors",
									"text-muted-foreground hover:text-foreground hover:bg-accent",
									editor.isActive("link") && "text-foreground bg-accent",
								)}
							/>
						}
					>
						<Link className="h-3.5 w-3.5" />
					</TooltipTrigger>
					<TooltipContent>Lien</TooltipContent>
				</Tooltip>
				<PopoverContent className="w-80 p-2">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleLinkSubmit();
						}}
						className="flex flex-col gap-2"
					>
						<Input
							value={linkUrl}
							onChange={(e) => setLinkUrl(e.target.value)}
							placeholder="https://..."
							className="h-7 text-sm"
							autoFocus
						/>
						<Input
							value={linkText}
							onChange={(e) => setLinkText(e.target.value)}
							placeholder="Texte du lien (facultatif)"
							className="h-7 text-sm"
						/>
						<Button
							type="submit"
							size="sm"
							className="h-7 px-2 text-xs self-end"
						>
							OK
						</Button>
					</form>
				</PopoverContent>
			</Popover>
		</div>
	);
}
