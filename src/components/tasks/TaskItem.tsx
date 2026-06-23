import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Archive,
	Copy,
	GripVertical,
	Trash2,
	TriangleAlert,
} from "lucide-react";
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
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { PRESET_ICONS } from "@/lib/icons";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Priority, Project, Task } from "@/types";

const PRIORITY_DOT: Record<Priority, string> = {
	high: "#ef4444",
	medium: "#eab308",
	low: "#22c55e",
	none: "transparent",
};

const PRIORITY_GLOW: Record<Priority, string> = {
	high: "0 0 5px rgba(239,68,68,0.7)",
	medium: "0 0 5px rgba(234,179,8,0.6)",
	low: "0 0 5px rgba(34,197,94,0.5)",
	none: "none",
};

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

const PRIORITY_BARS_GLOW: Record<Priority, string> = {
	high: "0 0 3px rgba(239,68,68,0.5)",
	medium: "0 0 3px rgba(234,179,8,0.45)",
	low: "0 0 3px rgba(34,197,94,0.4)",
	none: "none",
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
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);

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
					"rounded-xl border glass-card transition-all duration-150",
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

				<span className="shrink-0" data-testid="priority-indicator">
					{!colorblindMode ? (
						<span
							data-testid="priority-dot"
							className="rounded-full"
							style={{
								display: "block",
								width: 7,
								height: 7,
								background: PRIORITY_DOT[task.priority],
								boxShadow: PRIORITY_GLOW[task.priority],
								border:
									task.priority === "none"
										? "1.5px solid var(--border)"
										: undefined,
								marginLeft: 2,
							}}
						/>
					) : task.priority !== "none" ? (
						<span
							data-testid="priority-bars"
							style={{
								display: "flex",
								alignItems: "flex-end",
								gap: 1.5,
								height: 11,
								marginLeft: 2,
							}}
						>
							{[
								{ id: "low", height: 4, active: true },
								{
									id: "medium",
									height: 7,
									active:
										task.priority === "medium" || task.priority === "high",
								},
								{ id: "high", height: 11, active: task.priority === "high" },
							].map((bar) => (
								<span
									key={bar.id}
									style={{
										width: 3,
										height: bar.height,
										borderRadius: 1,
										background: PRIORITY_DOT[task.priority],
										opacity: bar.active ? 1 : 0.2,
										boxShadow: bar.active
											? PRIORITY_BARS_GLOW[task.priority]
											: "none",
									}}
								/>
							))}
						</span>
					) : (
						<span style={{ width: 13, display: "inline-block" }} />
					)}
				</span>

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
								isOverdue(task.dueDate) &&
									colorblindMode &&
									"underline font-semibold",
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
						className="text-xs shrink-0 h-5 flex items-center gap-1"
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
						{colorblindMode && tag.color && (
							<GroupColorShape
								color={tag.color}
								size={8}
								className="shrink-0"
							/>
						)}
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
				<ContextMenuItem onClick={handleCopyTitle}>
					<Copy className="h-4 w-4" />
					{t("task.copyTitle")}
				</ContextMenuItem>
				<ContextMenuSeparator />
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
							<GroupColorShape
								color={tag.color ?? "var(--muted-foreground)"}
								size={8}
								className="shrink-0"
							/>
							<span className="truncate">{tag.name}</span>
						</ContextMenuCheckboxItem>
					))
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
