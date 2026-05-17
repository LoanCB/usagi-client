import { Archive, CheckCircle, Circle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DueDatePicker } from "@/components/tasks/DueDatePicker";
import { PrioritySelector } from "@/components/tasks/PrioritySelector";
import { ProjectSelector } from "@/components/tasks/ProjectSelector";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { TagSelector } from "@/components/tasks/TagSelector";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Priority } from "@/types";

interface TaskDetailProps {
	readonly width: number;
}

export function TaskDetail({ width }: TaskDetailProps) {
	const {
		tasks,
		updateTask,
		completeTask,
		uncompleteTask,
		deleteTask,
		archiveTask,
	} = useTaskStore();
	const { selectedTaskId, setSelectedTask } = useUIStore();
	const { t } = useTranslation();

	const task = tasks.find((t) => t.id === selectedTaskId) ?? null;
	const [title, setTitle] = useState(task?.title ?? "");
	const [description, setDescription] = useState("");
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

	useEffect(() => {
		setTitle(task?.title ?? "");
		setDescription(task?.description ?? "");
	}, [task?.title, task?.description]);

	if (!task) return null;

	const repo = getRepository();

	const taskId = task.id;

	async function handleTitleBlur() {
		if (title.trim() && title !== task?.title) {
			await updateTask(repo, taskId, { title: title.trim() });
		}
	}

	async function handleDescriptionBlur() {
		const value = description.trim();
		const stored = task?.description ?? "";
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

	async function handleProjectChange(projectId: string | null) {
		await updateTask(repo, taskId, { projectId });
	}

	async function handleToggleComplete() {
		if (task?.completedAt) await uncompleteTask(repo, taskId);
		else await completeTask(repo, taskId);
	}

	async function handleDelete() {
		await deleteTask(repo, taskId);
		setConfirmDeleteOpen(false);
		setSelectedTask(null);
	}

	async function handleArchive() {
		await archiveTask(repo, taskId);
		setSelectedTask(null);
	}

	return (
		<div
			className="detail-panel-animate glass-panel shrink-0 flex flex-col h-full"
			style={{ width }}
		>
			{/* Complete / title */}
			<div className="flex items-center gap-3 p-4 border-b border-border">
				<button
					type="button"
					onClick={handleToggleComplete}
					className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
					aria-label={
						task.completedAt ? t("task.markIncomplete") : t("task.markComplete")
					}
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
					className="border-none shadow-none py-0 pl-2 pr-0 text-base font-medium focus-visible:ring-0 bg-transparent"
					placeholder={t("task.titlePlaceholder")}
					title={title}
				/>
				<button
					type="button"
					onClick={() => setSelectedTask(null)}
					className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors"
					aria-label={t("task.close")}
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{/* Description rich text */}
			<RichTextEditor
				value={description}
				onChange={setDescription}
				onBlur={handleDescriptionBlur}
				placeholder={t("task.descriptionPlaceholder")}
			/>

			{/* Metadata */}
			<div className="flex flex-col gap-1 p-3 border-b border-border">
				<ProjectSelector
					value={task.projectId}
					onChange={handleProjectChange}
				/>
				<PrioritySelector
					value={task.priority}
					onChange={handlePriorityChange}
				/>
				<DueDatePicker value={task.dueDate} onChange={handleDateChange} />
				<TagSelector
					selectedTagIds={task.tags.map((t) => t.id)}
					onChange={handleTagsChange}
					projectId={task.projectId}
				/>
			</div>

			{/* Actions */}
			<div className="p-3 mt-auto flex flex-col gap-1">
				<Button
					variant="ghost"
					size="sm"
					className="gap-2 w-full justify-start"
					onClick={handleArchive}
				>
					<Archive className="h-4 w-4" />
					{t("task.archive")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="gap-2 text-destructive hover:text-destructive w-full justify-start"
					onClick={() => setConfirmDeleteOpen(true)}
				>
					<Trash2 className="h-4 w-4" />
					{t("task.delete")}
				</Button>
			</div>
			<ConfirmDeleteDialog
				open={confirmDeleteOpen}
				onConfirm={handleDelete}
				onCancel={() => setConfirmDeleteOpen(false)}
			/>
		</div>
	);
}
