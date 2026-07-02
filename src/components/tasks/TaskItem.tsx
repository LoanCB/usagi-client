import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Priority, Project, Task } from "@/types";
import { PriorityIndicator } from "./TaskItem/PriorityIndicator";
import { TaskContextMenu } from "./TaskItem/TaskContextMenu";
import { TaskMeta } from "./TaskItem/TaskMeta";
import { TaskTitle } from "./TaskItem/TaskTitle";

const PRIORITY_BG: Record<Priority, string | undefined> = {
	high: "rgba(239,68,68,0.13)",
	medium: "rgba(234,179,8,0.11)",
	low: "rgba(34,197,94,0.10)",
	none: undefined,
};

const PRIORITY_BORDER: Record<Priority, string | undefined> = {
	high: "rgba(239,68,68,0.30)",
	medium: "rgba(234,179,8,0.26)",
	low: "rgba(34,197,94,0.22)",
	none: undefined,
};

interface TaskItemProps {
	readonly task: Task;
	readonly project?: Project;
	readonly onDeleteRequest: (id: string) => void;
}

export function TaskItem({ task, project, onDeleteRequest }: TaskItemProps) {
	const { completeTask, uncompleteTask, archiveTask, updateTask } =
		useTaskStore();
	const { selectedTaskId, setSelectedTask } = useUIStore();
	const { tags } = useTagStore();
	const { t } = useTranslation();
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);

	const [isEditing, setIsEditing] = useState(false);

	const visibleTags = tags.filter((tag) => {
		if (task.projectId === null) return tag.projectId === null;
		return tag.projectId === null || tag.projectId === task.projectId;
	});
	const isSelected = selectedTaskId === task.id;

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: task.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.45 : undefined,
		borderStyle: isDragging ? ("dashed" as const) : undefined,
		backgroundColor: isDragging
			? "transparent"
			: colorblindMode
				? undefined
				: PRIORITY_BG[task.priority],
		borderColor: colorblindMode ? undefined : PRIORITY_BORDER[task.priority],
	};

	async function handleChecked(checked: boolean) {
		const repo = getRepository();
		if (checked) await completeTask(repo, task.id);
		else await uncompleteTask(repo, task.id);
	}

	async function handleArchive() {
		await archiveTask(getRepository(), task.id);
	}

	async function handleCopyTitle() {
		try {
			await navigator.clipboard.writeText(task.title);
		} catch {
			// clipboard unavailable (e.g. window not focused)
		}
	}

	async function handleRename(title: string) {
		await updateTask(getRepository(), task.id, { title });
	}

	async function handleTagToggle(tagId: string, checked: boolean) {
		const currentIds = task.tags.map((tag) => tag.id);
		const newIds = checked
			? [...currentIds, tagId]
			: currentIds.filter((id) => id !== tagId);
		await updateTask(getRepository(), task.id, { tagIds: newIds });
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger
				ref={setNodeRef}
				style={style}
				className={cn(
					"task-row-animate group",
					"flex items-center gap-2 mx-3 my-1 pl-2 pr-3 py-2.5",
					"rounded-xl border glass-card transition-all duration-150",
					task.completedAt && "opacity-60",
					isSelected && "selected",
				)}
			>
				{/* Drag handle — always present, revealed on hover */}
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="w-[15px] shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity touch-none"
					aria-label={t("task.reorder")}
					tabIndex={0}
				>
					<GripVertical className="h-4 w-4" />
				</button>

				<Checkbox
					checked={!!task.completedAt}
					onCheckedChange={handleChecked}
					className="shrink-0"
				/>

				<PriorityIndicator
					priority={task.priority}
					colorblindMode={colorblindMode}
				/>

				{project?.icon &&
					(() => {
						const iconDef =
							PRESET_ICONS.find((i) => i.name === project.icon) ??
							PRESET_ICONS[0];
						const ProjectIcon = iconDef.icon;
						return (
							<ProjectIcon
								className="h-3.5 w-3.5 shrink-0"
								style={{ color: project.color ?? undefined }}
							/>
						);
					})()}

				<TaskTitle
					title={task.title}
					completed={!!task.completedAt}
					isEditing={isEditing}
					onSelect={() => setSelectedTask(task.id)}
					onStartEdit={() => setIsEditing(true)}
					onStopEdit={() => setIsEditing(false)}
					onRename={handleRename}
				/>

				<TaskMeta
					dueDate={task.dueDate}
					tags={task.tags}
					colorblindMode={colorblindMode}
				/>
			</ContextMenuTrigger>
			<TaskContextMenu
				taskTagIds={task.tags.map((tag) => tag.id)}
				visibleTags={visibleTags}
				onCopyTitle={handleCopyTitle}
				onEditTitle={() => setIsEditing(true)}
				onArchive={handleArchive}
				onDelete={() => onDeleteRequest(task.id)}
				onTagToggle={handleTagToggle}
			/>
		</ContextMenu>
	);
}
