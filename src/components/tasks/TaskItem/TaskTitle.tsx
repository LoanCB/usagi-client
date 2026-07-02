import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Delay before a single click acts, so a double-click can cancel it first.
const DOUBLE_CLICK_DELAY_MS = 200;

interface TaskTitleProps {
	readonly title: string;
	readonly completed: boolean;
	readonly isEditing: boolean;
	readonly onSelect: () => void;
	readonly onStartEdit: () => void;
	readonly onStopEdit: () => void;
	readonly onRename: (title: string) => void;
}

export function TaskTitle({
	title,
	completed,
	isEditing,
	onSelect,
	onStartEdit,
	onStopEdit,
	onRename,
}: TaskTitleProps) {
	const [draft, setDraft] = useState(title);
	const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Reset the draft whenever we (re-)enter edit mode.
	useEffect(() => {
		if (isEditing) setDraft(title);
	}, [isEditing, title]);

	// Clear any pending single-click timer when unmounting.
	useEffect(() => {
		return () => {
			if (clickTimer.current) clearTimeout(clickTimer.current);
		};
	}, []);

	function cancelClickTimer() {
		if (clickTimer.current) {
			clearTimeout(clickTimer.current);
			clickTimer.current = null;
		}
	}

	function handleClick() {
		// Defer selection so a following double-click can cancel it.
		cancelClickTimer();
		clickTimer.current = setTimeout(() => {
			clickTimer.current = null;
			onSelect();
		}, DOUBLE_CLICK_DELAY_MS);
	}

	function handleDoubleClick() {
		cancelClickTimer();
		onStartEdit();
	}

	function commitEdit() {
		onStopEdit();
		const trimmed = draft.trim();
		if (trimmed && trimmed !== title) onRename(trimmed);
	}

	function cancelEdit() {
		// Reset first so the blur that follows unmount sees no change to save.
		setDraft(title);
		onStopEdit();
	}

	if (isEditing) {
		return (
			<input
				// biome-ignore lint/a11y/noAutofocus: intentional — editing is user-initiated
				autoFocus
				type="text"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onFocus={(e) => e.target.select()}
				onBlur={commitEdit}
				onKeyDown={(e) => {
					if (e.key === "Enter") (e.target as HTMLInputElement).blur();
					else if (e.key === "Escape") cancelEdit();
				}}
				onPointerDown={(e) => e.stopPropagation()}
				className="flex-1 text-sm bg-transparent outline-none border-b border-border"
			/>
		);
	}

	return (
		<button
			type="button"
			className={cn(
				"flex-1 text-sm truncate text-left",
				completed && "line-through text-muted-foreground",
			)}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
		>
			{title}
		</button>
	);
}
