import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DueDatePicker } from "@/components/tasks/DueDatePicker";
import { PrioritySelector } from "@/components/tasks/PrioritySelector";
import { TagSelector } from "@/components/tasks/TagSelector";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useTaskStore } from "@/store/tasks";
import type { Priority } from "@/types";

interface QuickAddTaskProps {
	readonly projectId: string | null | undefined;
	readonly dueDate?: string | null;
	readonly focusTrigger?: number;
}

export function QuickAddTask({
	projectId,
	dueDate,
	focusTrigger,
}: QuickAddTaskProps) {
	const [title, setTitle] = useState("");
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [priority, setPriority] = useState<Priority>("none");
	const [internalDueDate, setInternalDueDate] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const priorityVisible = useSettingsStore((s) => s.quickAddPriorityVisible);
	const dueDateVisible = useSettingsStore((s) => s.quickAddDueDateVisible);
	const tagsVisible = useSettingsStore((s) => s.quickAddTagsVisible);

	const isCalendarContext = dueDate !== undefined;

	useEffect(() => {
		if (focusTrigger) inputRef.current?.focus();
	}, [focusTrigger]);
	const createTask = useTaskStore((s) => s.createTask);
	const { t } = useTranslation();

	async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			const trimmed = title.trim();
			if (!trimmed) return;
			const effectiveDueDate = isCalendarContext ? dueDate : internalDueDate;
			try {
				await createTask(getRepository(), {
					title: trimmed,
					projectId: projectId ?? null,
					tagIds,
					priority,
					...(effectiveDueDate ? { dueDate: effectiveDueDate } : {}),
				});
				setTitle("");
				setTagIds([]);
				setPriority("none");
				setInternalDueDate(null);
				inputRef.current?.focus();
			} catch (err) {
				console.error("Failed to create task", err);
			}
		} else if (e.key === "Escape") {
			setTitle("");
		}
	}

	return (
		<div className="flex items-center gap-3 mx-3 mb-3 mt-1 px-4 py-2.5 rounded-xl glass-stat">
			<div className="w-3.5 h-3.5 rounded-sm border border-dashed border-muted-foreground/40 shrink-0" />
			<input
				ref={inputRef}
				type="text"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={t("task.titlePlaceholder")}
				aria-label={t("task.titlePlaceholder")}
				className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
			/>
			{priorityVisible && (
				<PrioritySelector
					value={priority}
					onChange={setPriority}
					triggerClassName="text-muted-foreground"
				/>
			)}
			{dueDateVisible && !isCalendarContext && (
				<DueDatePicker
					value={internalDueDate}
					onChange={setInternalDueDate}
					triggerClassName="text-muted-foreground"
				/>
			)}
			{tagsVisible && (
				<TagSelector
					selectedTagIds={tagIds}
					onChange={setTagIds}
					triggerClassName="text-muted-foreground"
					projectId={projectId}
				/>
			)}
		</div>
	);
}
