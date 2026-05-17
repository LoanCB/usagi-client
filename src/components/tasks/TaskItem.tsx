import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, GripVertical, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroupLabel,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PRESET_ICONS } from "@/lib/icons";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project, Task } from "@/types";

const PRIORITY_BORDER_COLORS: Record<string, string> = {
	high: "var(--priority-high)",
	medium: "var(--priority-medium)",
	low: "var(--priority-low)",
	none: "transparent",
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
	const { t, i18n } = useTranslation();

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
		background: isDragging ? "transparent" : undefined,
		borderLeftColor: PRIORITY_BORDER_COLORS[task.priority],
	};

	async function handleChecked(checked: boolean) {
		const repo = getRepository();
		if (checked) await completeTask(repo, task.id);
		else await uncompleteTask(repo, task.id);
	}

	async function handleArchive() {
		await archiveTask(getRepository(), task.id);
	}

	async function handleTagToggle(tagId: string, checked: boolean) {
		const currentIds = task.tags.map((t) => t.id);
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
					"rounded-xl border border-l-[3px] glass-card transition-all duration-150",
					task.completedAt && "opacity-60",
					isSelected && "selected",
				)}
			>
				{/* Drag handle — always present, revealed on hover */}
				<button
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

				{/* Clickable title area */}
				<button
					type="button"
					className={cn(
						"flex-1 text-sm truncate text-left",
						task.completedAt && "line-through text-muted-foreground",
					)}
					onClick={() => setSelectedTask(task.id)}
				>
					{task.title}
				</button>

				{task.dueDate && (
					<span className="flex items-center gap-1 shrink-0">
						{isOverdue(task.dueDate) && (
							<TriangleAlert className="h-3.5 w-3.5 text-[var(--priority-high)]" />
						)}
						<span
							className={cn(
								"text-xs",
								isOverdue(task.dueDate)
									? "text-[var(--priority-high)]"
									: "text-muted-foreground",
							)}
						>
							{formatDate(task.dueDate, i18n.language)}
						</span>
					</span>
				)}
				{task.tags.slice(0, 2).map((tag) => (
					<Badge
						key={tag.id}
						variant="secondary"
						className="text-xs shrink-0 h-5"
						style={
							tag.color
								? {
										backgroundColor: `${tag.color}28`,
										color: tag.color,
										borderColor: `${tag.color}50`,
									}
								: undefined
						}
					>
						{tag.name}
					</Badge>
				))}
				{task.tags.length > 2 && (
					<Badge variant="secondary" className="text-xs shrink-0 h-5">
						+{task.tags.length - 2}
					</Badge>
				)}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={handleArchive}>
					<Archive className="h-4 w-4" />
					{t("task.archive")}
				</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					closeOnClick={false}
					onClick={() => onDeleteRequest(task.id)}
				>
					<Trash2 className="h-4 w-4" />
					{t("common.delete")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuGroupLabel>{t("tag.tags")}</ContextMenuGroupLabel>
				{visibleTags.length === 0 ? (
					<p className="px-1.5 py-1 text-xs text-muted-foreground">
						{t("tag.noTags")}
					</p>
				) : (
					visibleTags.map((tag) => (
						<ContextMenuCheckboxItem
							key={tag.id}
							checked={task.tags.some((t) => t.id === tag.id)}
							onCheckedChange={(checked) => handleTagToggle(tag.id, checked)}
						>
							<span
								className="h-2 w-2 rounded-full shrink-0"
								style={{ background: tag.color ?? "var(--muted-foreground)" }}
							/>
							<span className="truncate">{tag.name}</span>
						</ContextMenuCheckboxItem>
					))
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
