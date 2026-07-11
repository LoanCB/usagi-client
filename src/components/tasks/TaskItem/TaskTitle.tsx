import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
	const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	if (isEditing) {
		return (
			<TaskTitleEditor
				title={title}
				onStopEdit={onStopEdit}
				onRename={onRename}
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

function TaskTitleEditor({
	title,
	onStopEdit,
	onRename,
}: {
	readonly title: string;
	readonly onStopEdit: () => void;
	readonly onRename: (title: string) => void;
}) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState(title);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	function commitEdit() {
		onStopEdit();
		const trimmed = draft.trim();
		if (trimmed && trimmed !== title) onRename(trimmed);
	}

	function cancelEdit() {
		setDraft(title);
		onStopEdit();
	}

	return (
		<input
			ref={inputRef}
			type="text"
			aria-label={t("task.rename")}
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
