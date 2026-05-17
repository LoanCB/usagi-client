import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TagSelector } from "@/components/tasks/TagSelector";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";

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
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (focusTrigger) inputRef.current?.focus();
	}, [focusTrigger]);
	const createTask = useTaskStore((s) => s.createTask);
	const { t } = useTranslation();

	async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			const trimmed = title.trim();
			if (!trimmed) return;
			try {
				await createTask(getRepository(), {
					title: trimmed,
					projectId: projectId ?? null,
					tagIds,
					...(dueDate !== undefined && dueDate !== null ? { dueDate } : {}),
				});
				setTitle("");
				setTagIds([]);
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
			<TagSelector
				selectedTagIds={tagIds}
				onChange={setTagIds}
				triggerClassName="text-muted-foreground"
				projectId={projectId}
			/>
		</div>
	);
}
