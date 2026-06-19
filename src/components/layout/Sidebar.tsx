import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
	ArchiveX,
	Calendar,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	FolderPlus,
	ListChecks,
	MoreVertical,
	Pencil,
	Plus,
	Search,
	Settings2,
	Tag,
	Tags,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logoUrl from "@/assets/logo.png";
import { DropIndicator } from "@/components/layout/DropIndicator";
import { ProjectGroupNavItem } from "@/components/layout/ProjectGroupNavItem";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { CreateGroupDialog } from "@/components/projects/CreateGroupDialog";
import { DeleteProjectDialog } from "@/components/projects/DeleteProjectDialog";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRESET_COLORS } from "@/lib/colors";
import { PRESET_ICONS } from "@/lib/icons";
import { cn, isMac } from "@/lib/utils";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSearchStore } from "@/store/search";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project, ProjectGroup } from "@/types";

interface TagCreationFormProps {
	readonly projectName: string;
	readonly tagName: string;
	readonly tagColor: string;
	readonly tagInputRef: React.RefObject<HTMLInputElement | null>;
	readonly onTagNameChange: (name: string) => void;
	readonly onTagColorChange: (color: string) => void;
	readonly onSubmit: () => void;
}

function TagCreationForm({
	projectName,
	tagName,
	tagColor,
	tagInputRef,
	onTagNameChange,
	onTagColorChange,
	onSubmit,
}: TagCreationFormProps) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-2">
			<p className="text-[10px] uppercase tracking-wider text-muted-foreground">
				{t("project.newTagFor", { name: projectName })}
			</p>
			<Input
				ref={tagInputRef}
				autoFocus
				placeholder={t("tag.namePlaceholder")}
				value={tagName}
				onChange={(e) => onTagNameChange(e.target.value)}
				className="h-7 text-sm text-foreground"
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") {
						e.preventDefault();
						onSubmit();
					}
				}}
				onClick={(e) => e.stopPropagation()}
			/>
			<div className="flex gap-1.5 flex-wrap">
				{PRESET_COLORS.map((c) => (
					<button
						key={c}
						type="button"
						className="h-4 w-4 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						style={{
							background: c,
							outline: tagColor === c ? `2px solid ${c}` : undefined,
							outlineOffset: tagColor === c ? "2px" : undefined,
						}}
						onClick={(e) => {
							e.stopPropagation();
							onTagColorChange(c);
						}}
						aria-label={t("common.colorOption", { color: c })}
					/>
				))}
			</div>
			{tagName.trim() && (
				<div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/30 w-fit">
					<span
						className="h-2 w-2 rounded-full shrink-0"
						style={{ background: tagColor }}
					/>
					<span className="text-xs truncate max-w-[9rem]">
						{tagName.trim()}
					</span>
				</div>
			)}
			<Button
				size="sm"
				className="w-full"
				disabled={!tagName.trim()}
				onClick={(e) => {
					e.stopPropagation();
					onSubmit();
				}}
			>
				{t("common.create")}
			</Button>
		</div>
	);
}

interface NavItemProps {
	readonly icon: React.ReactNode;
	readonly label: string;
	readonly active: boolean;
	readonly collapsed: boolean;
	readonly onClick: () => void;
	readonly count?: number;
}

function NavItem({
	icon,
	label,
	active,
	collapsed,
	onClick,
	count,
}: NavItemProps) {
	const inner = (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm transition-colors text-left",
				"border-l-2 border-transparent",
				"text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
				active &&
					"bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary",
			)}
		>
			<span className="shrink-0">{icon}</span>
			{!collapsed && <span className="truncate flex-1">{label}</span>}
			{!collapsed && count !== undefined && (
				<span className="ml-auto text-xs text-muted-foreground/70 bg-foreground/[0.06] rounded-full min-w-[1.25rem] text-center px-1.5 py-0.5 leading-none shrink-0">
					{count}
				</span>
			)}
		</button>
	);

	if (collapsed) {
		return (
			<TooltipProvider delay={300}>
				<Tooltip>
					<TooltipTrigger>{inner}</TooltipTrigger>
					<TooltipContent side="right">{label}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}
	return inner;
}

interface ProjectNavItemProps {
	readonly project: Project;
	readonly active: boolean;
	readonly collapsed: boolean;
	readonly onClick: () => void;
	readonly isMergeTarget?: boolean;
	readonly itemRef?: (el: HTMLDivElement | null) => void;
}

function ProjectNavItem({
	project,
	active,
	collapsed,
	onClick,
	isMergeTarget,
	itemRef,
}: ProjectNavItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
		isDragging,
	} = useDraggable({ id: `project:${project.id}` });

	const [menuOpen, setMenuOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [tagName, setTagName] = useState("");
	const [tagColor, setTagColor] = useState<string>(PRESET_COLORS[5]);
	const tagInputRef = useRef<HTMLInputElement>(null);
	const { deleteProject } = useProjectStore();
	const { selectedProjectId, setSelectedProject } = useUIStore();
	const { t } = useTranslation();

	async function handleConfirmDelete(
		options: import("@/components/projects/DeleteProjectDialog").DeleteProjectOptions,
	) {
		setDeleteOpen(false);
		const repo = getRepository();
		const {
			tagAction,
			taskAction,
			targetProjectId,
			targetTagProjectId,
			summary,
		} = options;

		// --- Tags: update DB then sync store so deleteProject's filter sees the new projectIds ---
		const tagIds = new Set(summary.tags.map((t) => t.id));
		if (tagAction === "generic") {
			await Promise.all(
				summary.tags.map((tag) =>
					repo.updateTag(tag.id, {
						name: tag.name,
						color: tag.color ?? undefined,
						projectId: null,
					}),
				),
			);
			useTagStore.setState((s) => ({
				tags: s.tags.map((t) =>
					tagIds.has(t.id) ? { ...t, projectId: null } : t,
				),
			}));
		} else if (tagAction === "project" && targetTagProjectId) {
			await Promise.all(
				summary.tags.map((tag) =>
					repo.updateTag(tag.id, {
						name: tag.name,
						color: tag.color ?? undefined,
						projectId: targetTagProjectId,
					}),
				),
			);
			useTagStore.setState((s) => ({
				tags: s.tags.map((t) =>
					tagIds.has(t.id) ? { ...t, projectId: targetTagProjectId } : t,
				),
			}));
		} else if (tagAction === "delete") {
			await Promise.all(summary.tags.map((tag) => repo.deleteTag(tag.id)));
			useTagStore.setState((s) => ({
				tags: s.tags.filter((t) => !tagIds.has(t.id)),
			}));
		}

		// --- Tasks: update DB then sync store ---
		const allTasks = [
			...summary.pendingTasks,
			...summary.completedTasks,
			...summary.archivedTasks,
		];
		const allTaskIds = new Set(allTasks.map((t) => t.id));
		const archivedAndCompletedIds = new Set([
			...summary.pendingTasks.map((t) => t.id),
			...summary.completedTasks.map((t) => t.id),
		]);
		if (taskAction === "delete") {
			await Promise.all(
				[...summary.pendingTasks, ...summary.completedTasks].map((task) =>
					repo.archiveTask(task.id),
				),
			);
			useTaskStore.setState((s) => ({
				tasks: s.tasks.filter((t) => !archivedAndCompletedIds.has(t.id)),
			}));
			await useTaskStore.getState().refreshCounts(repo);
		} else if (taskAction === "inbox") {
			await repo.moveTasksToProject([...allTaskIds], null);
			useTaskStore.setState((s) => ({
				tasks: s.tasks.map((t) =>
					allTaskIds.has(t.id) ? { ...t, projectId: null } : t,
				),
			}));
		} else if (taskAction === "project" && targetProjectId) {
			await repo.moveTasksToProject([...allTaskIds], targetProjectId);
			useTaskStore.setState((s) => ({
				tasks: s.tasks.map((t) =>
					allTaskIds.has(t.id) ? { ...t, projectId: targetProjectId } : t,
				),
			}));
		}

		// --- Delete project (also cleans up store + residual tag store entries) ---
		await deleteProject(repo, project.id);
		if (selectedProjectId === project.id) setSelectedProject(null);
	}

	async function handleCreateTag() {
		if (!tagName.trim()) return;
		await useTagStore.getState().createTag(getRepository(), {
			name: tagName.trim(),
			color: tagColor,
			projectId: project.id,
		});
		setTagName("");
		setTagColor(PRESET_COLORS[5]);
		tagInputRef.current?.focus();
	}

	const iconDef =
		PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
	const ProjectIcon = iconDef.icon;

	const icon = (
		<ProjectIcon
			className="h-4 w-4 shrink-0"
			style={{ color: project.color ?? undefined }}
		/>
	);

	const projectButton = (
		<TooltipProvider delay={collapsed ? 300 : 600}>
			<Tooltip>
				<TooltipTrigger
					render={<button type="button" />}
					className={cn(
						"group flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm transition-colors",
						"border-l-2 border-transparent",
						"text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
						active &&
							"bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary",
						isMergeTarget && "ring-2 ring-sidebar-primary animate-pulse",
					)}
					onClick={onClick}
				>
					{icon}
					{!collapsed && isMergeTarget && (
						<FolderPlus className="h-3 w-3 shrink-0 text-sidebar-primary" />
					)}
					{!collapsed && (
						<>
							<span className="truncate flex-1 text-left">{project.name}</span>
							<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
								<DropdownMenuTrigger
									className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-sidebar-foreground/10 transition-opacity shrink-0"
									onClick={(e) => e.stopPropagation()}
									aria-label={t("project.options")}
								>
									<MoreVertical className="h-3.5 w-3.5" />
								</DropdownMenuTrigger>
								<DropdownMenuContent side="right" align="start">
									<DropdownMenuItem
										render={
											<button
												type="button"
												className="w-full flex items-center gap-2"
												onClick={() => {
													setMenuOpen(false);
													setEditOpen(true);
												}}
											>
												<Pencil className="h-4 w-4" />
												{t("common.edit")}
											</button>
										}
									/>
									<DropdownMenuSub>
										<DropdownMenuSubTrigger>
											<Tag className="h-3.5 w-3.5" />
											{t("project.newTag")}
										</DropdownMenuSubTrigger>
										<DropdownMenuSubContent className="p-3 w-[276px]">
											<TagCreationForm
												projectName={project.name}
												tagName={tagName}
												tagColor={tagColor}
												tagInputRef={tagInputRef}
												onTagNameChange={setTagName}
												onTagColorChange={setTagColor}
												onSubmit={handleCreateTag}
											/>
										</DropdownMenuSubContent>
									</DropdownMenuSub>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onClick={() => {
											setMenuOpen(false);
											setDeleteOpen(true);
										}}
									>
										<Trash2 className="h-4 w-4" />
										{t("common.delete")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					)}
				</TooltipTrigger>
				<TooltipContent side="right">{project.name}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);

	return (
		<div
			ref={(el) => {
				setDragRef(el);
				itemRef?.(el);
			}}
			style={{ opacity: isDragging ? 0.3 : 1 }}
			{...attributes}
			{...listeners}
		>
			{collapsed ? (
				projectButton
			) : (
				<ContextMenu>
					<ContextMenuTrigger>{projectButton}</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem
							onClick={() => {
								setEditOpen(true);
							}}
						>
							<Pencil className="h-3.5 w-3.5" />
							{t("common.edit")}
						</ContextMenuItem>
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<Tag className="h-3.5 w-3.5" />
								{t("project.newTag")}
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-[276px] min-w-0">
								<TagCreationForm
									projectName={project.name}
									tagName={tagName}
									tagColor={tagColor}
									tagInputRef={tagInputRef}
									onTagNameChange={setTagName}
									onTagColorChange={setTagColor}
									onSubmit={handleCreateTag}
								/>
							</ContextMenuSubContent>
						</ContextMenuSub>
						<ContextMenuSeparator />
						<ContextMenuItem
							variant="destructive"
							onClick={() => {
								setDeleteOpen(true);
							}}
						>
							<Trash2 className="h-3.5 w-3.5" />
							{t("common.delete")}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			)}
			<ProjectForm
				project={project}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>
			<DeleteProjectDialog
				project={project}
				open={deleteOpen}
				onConfirm={handleConfirmDelete}
				onCancel={() => setDeleteOpen(false)}
			/>
		</div>
	);
}

type SidebarItem =
	| { type: "group"; group: ProjectGroup; projects: Project[]; dndId: string }
	| { type: "project"; project: Project; dndId: string };

type DropState =
	| { intent: "reorder"; beforeId: string | null }
	| { intent: "merge"; targetId: string }
	| { intent: "join-group"; groupId: string }
	| null;

export function Sidebar() {
	const { t } = useTranslation();
	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		selectedProjectId,
		setSelectedProject,
		collapsedGroupIds,
	} = useUIStore();
	const projects = useProjectStore((s) => s.projects);
	const { reorderProjects, assignToGroup } = useProjectStore();
	const groups = useProjectGroupStore((s) => s.groups);
	const allCount = useTaskStore((s) => s.allCount);
	const todayCount = useTaskStore((s) => s.todayCount);
	const calendarVisible = useSettingsStore((s) => s.calendarVisible);
	const archivesVisible = useSettingsStore((s) => s.archivesVisible);
	const tagsVisible = useSettingsStore((s) => s.tagsVisible);
	const searchTriggerVisible = useSettingsStore((s) => s.searchTriggerVisible);
	const openSearch = useSearchStore((s) => s.open);

	const sidebarItems = useMemo((): SidebarItem[] => {
		const items: SidebarItem[] = [];
		const groupMap = new Map(groups.map((g) => [g.id, g]));
		const projectsByGroup = new Map<string, Project[]>();
		const standaloneProjects: Project[] = [];

		for (const p of projects) {
			if (p.groupId) {
				const list = projectsByGroup.get(p.groupId) ?? [];
				list.push(p);
				projectsByGroup.set(p.groupId, list);
			} else {
				standaloneProjects.push(p);
			}
		}

		const allTopLevel: Array<{ sortOrder: number; item: SidebarItem }> = [];

		for (const [gid, gProjects] of projectsByGroup) {
			const group = groupMap.get(gid);
			if (!group) continue;
			const sorted = [...gProjects].sort((a, b) => a.sortOrder - b.sortOrder);
			allTopLevel.push({
				sortOrder: group.sortOrder,
				item: { type: "group", group, projects: sorted, dndId: `group:${gid}` },
			});
		}

		for (const p of standaloneProjects) {
			allTopLevel.push({
				sortOrder: p.sortOrder,
				item: { type: "project", project: p, dndId: `project:${p.id}` },
			});
		}

		allTopLevel.sort((a, b) => a.sortOrder - b.sortOrder);

		for (const { item } of allTopLevel) {
			items.push(item);
			if (item.type === "group" && !collapsedGroupIds.has(item.group.id)) {
				for (const p of item.projects) {
					items.push({ type: "project", project: p, dndId: `project:${p.id}` });
				}
			}
		}

		return items;
	}, [projects, groups, collapsedGroupIds]);

	const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
	const [pendingGroupProjects, setPendingGroupProjects] = useState<{
		projectA: Project;
		projectB: Project;
	} | null>(null);
	const [dropState, setDropState] = useState<DropState>(null);
	const itemRectsRef = useRef<Map<string, DOMRect>>(new Map());
	const hasFreshRectsRef = useRef(false);
	const { reorderGroups } = useProjectGroupStore();

	function makeItemRef(dndId: string) {
		return (el: HTMLDivElement | null) => {
			if (el) {
				itemRectsRef.current.set(dndId, el.getBoundingClientRect());
			} else {
				itemRectsRef.current.delete(dndId);
			}
		};
	}

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
	);

	function handleDragStart({ active }: DragStartEvent) {
		const id = String(active.id);
		if (id.startsWith("project:")) setActiveProjectId(id.slice(8));
		setDropState(null);
		hasFreshRectsRef.current = false;
		// Refresh all rects at drag start so we have fresh values
		itemRectsRef.current.clear();
		document.querySelectorAll("[data-dnd-item]").forEach((el) => {
			const itemId = (el as HTMLElement).dataset.dndItem;
			if (itemId) itemRectsRef.current.set(itemId, el.getBoundingClientRect());
		});
	}

	function handleDragMove({
		active,
		delta,
	}: import("@dnd-kit/core").DragMoveEvent) {
		const activeId = String(active.id);
		if (!activeId.startsWith("project:")) return;
		const draggedProjectId = activeId.slice(8);
		const draggedProject = projects.find((p) => p.id === draggedProjectId);
		if (!draggedProject) return;

		if (!hasFreshRectsRef.current) {
			itemRectsRef.current.clear();
			document.querySelectorAll("[data-dnd-item]").forEach((el) => {
				const itemId = (el as HTMLElement).dataset.dndItem;
				if (itemId)
					itemRectsRef.current.set(itemId, el.getBoundingClientRect());
			});
			hasFreshRectsRef.current = true;
		}

		// Current pointer Y = initial rect center + delta
		const initialRect = active.rect.current.initial;
		if (!initialRect) return;
		const pointerY = initialRect.top + initialRect.height / 2 + delta.y;

		// Build expanded group rects: from group header top to last visible child bottom
		// This lets the dashed border cover the whole group container
		const groupBounds = new Map<string, { top: number; bottom: number }>();
		for (const item of sidebarItems) {
			if (item.type !== "group") continue;
			const groupDndId = item.dndId;
			const groupRect = itemRectsRef.current.get(groupDndId);
			if (!groupRect) continue;
			let bottom = groupRect.bottom;
			// If group is expanded, extend bottom to last child
			if (!collapsedGroupIds.has(item.group.id)) {
				for (const p of item.projects) {
					const childRect = itemRectsRef.current.get(`project:${p.id}`);
					if (childRect && childRect.bottom > bottom) bottom = childRect.bottom;
				}
			}
			groupBounds.set(item.group.id, { top: groupRect.top, bottom });
		}

		// Check if pointer is inside a group's expanded container
		for (const [groupId, bounds] of groupBounds) {
			if (pointerY >= bounds.top && pointerY <= bounds.bottom) {
				// Check if it's near the very top edge → reorder before the group
				const groupItem = sidebarItems.find(
					(i) => i.type === "group" && i.group.id === groupId,
				);
				const groupRect = groupItem
					? itemRectsRef.current.get(groupItem.dndId)
					: null;
				if (groupRect && pointerY < groupRect.top + groupRect.height * 0.25) {
					setDropState({ intent: "reorder", beforeId: `group:${groupId}` });
				} else {
					setDropState({ intent: "join-group", groupId });
				}
				return;
			}
		}

		// Walk top-level items (groups and standalone projects)
		for (const item of sidebarItems) {
			if (item.dndId === activeId) continue;
			// Skip child projects of groups — handled by groupBounds above
			if (item.type === "project" && item.project.groupId) continue;

			const rect = itemRectsRef.current.get(item.dndId);
			if (!rect) continue;

			const topZone = rect.top + rect.height * 0.3;
			const midZone = rect.top + rect.height * 0.7;

			if (pointerY < topZone) {
				setDropState({ intent: "reorder", beforeId: item.dndId });
				return;
			}
			if (pointerY < midZone) {
				// Standalone project → merge intent
				setDropState({ intent: "merge", targetId: item.dndId });
				return;
			}
		}

		// Pointer is below all items → append at end
		setDropState({ intent: "reorder", beforeId: null });
	}

	async function handleDragEnd({ active }: DragEndEvent) {
		setActiveProjectId(null);
		const currentDrop = dropState;
		setDropState(null);

		const activeId = String(active.id);
		if (!activeId.startsWith("project:")) return;

		const draggedProjectId = activeId.slice(8);
		const draggedProject = projects.find((p) => p.id === draggedProjectId);
		if (!draggedProject) return;

		const repo = getRepository();

		if (!currentDrop) {
			// Dropped outside — ungroup if needed
			if (draggedProject.groupId) {
				assignToGroup(repo, draggedProjectId, null);
			}
			return;
		}

		if (currentDrop.intent === "join-group") {
			assignToGroup(repo, draggedProjectId, currentDrop.groupId);
			return;
		}

		if (currentDrop.intent === "merge") {
			const targetProjectId = currentDrop.targetId.slice(8); // targetId is "project:<id>"
			const targetProject = projects.find((p) => p.id === targetProjectId);
			if (!targetProject) return;
			if (targetProject.groupId) {
				assignToGroup(repo, draggedProjectId, targetProject.groupId);
			} else {
				setPendingGroupProjects({
					projectA: draggedProject,
					projectB: targetProject,
				});
			}
			return;
		}

		if (currentDrop.intent === "reorder") {
			const { beforeId } = currentDrop;

			// Build the ordered list of top-level dndIds (groups + standalone projects)
			const topLevel = sidebarItems.filter(
				(i) =>
					i.type === "group" || (i.type === "project" && !i.project.groupId),
			);

			// If dragged project is inside a group, check if drop target is outside the group
			if (draggedProject.groupId) {
				// Determine if the beforeId target is a sibling in the same group
				const beforeProjectId = beforeId?.startsWith("project:")
					? beforeId.slice(8)
					: null;
				const beforeProject = beforeProjectId
					? projects.find((p) => p.id === beforeProjectId)
					: null;
				const isTargetInSameGroup =
					beforeProject?.groupId === draggedProject.groupId;
				const isTargetGroupHeader = beforeId?.startsWith("group:");
				const isAppendToEnd = beforeId === null;

				if (isTargetInSameGroup) {
					// Intra-group reorder
					const groupProjects = projects
						.filter((p) => p.groupId === draggedProject.groupId)
						.sort((a, b) => a.sortOrder - b.sortOrder);
					const ids = groupProjects.map((p) => p.id);
					const oldIdx = ids.indexOf(draggedProjectId);
					const newIdx = beforeProjectId
						? ids.indexOf(beforeProjectId)
						: ids.length;
					if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
						const adjusted = newIdx > oldIdx ? newIdx - 1 : newIdx;
						const newOrder = arrayMove(ids, oldIdx, adjusted);
						reorderProjects(repo, newOrder);
					}
					return;
				}

				// Target is outside the group (top-level item, different group, or end of list)
				// → ungroup the project first
				await assignToGroup(repo, draggedProjectId, null);
				// If dropped before a group header or at the end, no further reorder needed
				// (the store reload will place it at the end of standalone projects)
				if (!isTargetGroupHeader && !isAppendToEnd && beforeId) {
					// beforeId points to a standalone project → reorder among standalone
					const standaloneProjects = projects
						.filter((p) => !p.groupId && p.id !== draggedProjectId)
						.sort((a, b) => a.sortOrder - b.sortOrder);
					const ids = standaloneProjects.map((p) => p.id);
					ids.push(draggedProjectId); // append ungrouped project at end temporarily
					const newIdx = beforeProjectId
						? ids.indexOf(beforeProjectId)
						: ids.length;
					const oldIdx = ids.indexOf(draggedProjectId);
					if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
						const adjusted = newIdx > oldIdx ? newIdx - 1 : newIdx;
						const newOrder = arrayMove(ids, oldIdx, adjusted);
						reorderProjects(repo, newOrder);
					}
				}
				return;
			}

			// Top-level reorder
			const topLevelIds = topLevel.map((i) => i.dndId);
			const dragDndId = `project:${draggedProjectId}`;
			const oldIdx = topLevelIds.indexOf(dragDndId);
			const newIdx = beforeId
				? topLevelIds.indexOf(beforeId)
				: topLevelIds.length;
			if (oldIdx === -1 || newIdx === -1) return;
			if (oldIdx === newIdx) return;
			const adjusted = newIdx > oldIdx ? newIdx - 1 : newIdx;
			const reordered = arrayMove(topLevelIds, oldIdx, adjusted);

			const newGroupOrder = reordered
				.filter((id) => id.startsWith("group:"))
				.map((id) => id.slice(6));
			const newProjectOrder = reordered
				.filter((id) => id.startsWith("project:"))
				.map((id) => id.slice(8));
			if (newGroupOrder.length > 0) reorderGroups(repo, newGroupOrder);
			if (newProjectOrder.length > 0) reorderProjects(repo, newProjectOrder);
		}
	}

	useEffect(() => {
		if (
			(selectedProjectId === "calendar" && !calendarVisible) ||
			(selectedProjectId === "archives" && !archivesVisible) ||
			(selectedProjectId === "tags" && !tagsVisible)
		) {
			setSelectedProject(undefined);
		}
	}, [
		selectedProjectId,
		calendarVisible,
		archivesVisible,
		tagsVisible,
		setSelectedProject,
	]);

	return (
		<div
			className={cn(
				"glass-sidebar relative flex flex-col h-full bg-sidebar shrink-0 transition-all duration-200",
				sidebarCollapsed ? "w-14" : "w-56",
			)}
		>
			{/* Collapse handle — floats on the sidebar's right edge */}
			<button
				type="button"
				onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
				aria-label={
					sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
				}
				className="absolute top-[22px] -right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-popover/90 text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:text-foreground"
			>
				{sidebarCollapsed ? (
					<ChevronRight className="h-3 w-3" />
				) : (
					<ChevronLeft className="h-3 w-3" />
				)}
			</button>

			{/* Logo */}
			<div
				className={cn(
					"flex items-center gap-2.5 px-4 py-[18px] shrink-0",
					sidebarCollapsed && "justify-center",
				)}
			>
				<img
					src={logoUrl}
					alt="Logo"
					className="h-8 w-8 shrink-0 object-contain drop-shadow-sm"
				/>
				{!sidebarCollapsed && (
					<span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
						Bunly
					</span>
				)}
			</div>

			{/* Search trigger */}
			{searchTriggerVisible && (
				<div className={cn("shrink-0 px-2 pb-2", sidebarCollapsed && "px-1")}>
					{sidebarCollapsed ? (
						<TooltipProvider delay={300}>
							<Tooltip>
								<TooltipTrigger
									render={<button type="button" />}
									onClick={openSearch}
									className="flex w-full items-center justify-center rounded-md py-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/70"
								>
									<Search className="h-4 w-4" />
								</TooltipTrigger>
								<TooltipContent side="right">
									{t("search.trigger")}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : (
						<button
							type="button"
							onClick={openSearch}
							className="flex w-full items-center gap-2 rounded-md border border-border/40 bg-sidebar-accent/20 px-2.5 py-1.5 text-left text-sm text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/70"
						>
							<Search className="h-4 w-4 shrink-0" />
							<span className="flex-1">{t("search.trigger")}</span>
							<kbd className="rounded border border-border/50 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/40">
								{isMac() ? "⌘K" : "Ctrl+K"}
							</kbd>
						</button>
					)}
				</div>
			)}

			<ScrollArea className="flex-1 px-2">
				<div className="space-y-1.5 pb-2">
					{!sidebarCollapsed && (
						<p className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
							{t("nav.views")}
						</p>
					)}
					<NavItem
						icon={<Calendar className="h-4 w-4" />}
						label={t("nav.today")}
						active={selectedProjectId === "today"}
						collapsed={sidebarCollapsed}
						onClick={() => setSelectedProject("today")}
						count={todayCount}
					/>
					<NavItem
						icon={<ListChecks className="h-4 w-4" />}
						label={t("nav.allTasks")}
						active={selectedProjectId === undefined}
						collapsed={sidebarCollapsed}
						onClick={() => setSelectedProject(undefined)}
						count={allCount}
					/>
					{tagsVisible && (
						<NavItem
							icon={<Tags className="h-4 w-4" />}
							label={t("nav.tags")}
							active={selectedProjectId === "tags"}
							collapsed={sidebarCollapsed}
							onClick={() => setSelectedProject("tags")}
						/>
					)}
					{calendarVisible && (
						<NavItem
							icon={<CalendarDays className="h-4 w-4" />}
							label={t("nav.calendar")}
							active={selectedProjectId === "calendar"}
							collapsed={sidebarCollapsed}
							onClick={() => setSelectedProject("calendar")}
						/>
					)}
					{archivesVisible && (
						<NavItem
							icon={<ArchiveX className="h-4 w-4" />}
							label={t("nav.archives")}
							active={selectedProjectId === "archives"}
							collapsed={sidebarCollapsed}
							onClick={() => setSelectedProject("archives")}
						/>
					)}
				</div>

				<Separator className="my-2 bg-sidebar-border" />

				<div className="space-y-1.5 pb-2">
					{!sidebarCollapsed && (
						<div className="flex items-center justify-between px-3 py-1">
							<p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
								{t("nav.projects")}
							</p>
							<ProjectForm>
								<Button
									variant="ghost"
									size="icon"
									className="h-5 w-5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
									aria-label={t("project.new")}
								>
									<Plus className="h-3.5 w-3.5" />
								</Button>
							</ProjectForm>
						</div>
					)}
					<DndContext
						sensors={sensors}
						onDragStart={handleDragStart}
						onDragMove={handleDragMove}
						onDragEnd={handleDragEnd}
					>
						{sidebarItems.map((item, index) => {
							// Show DropIndicator BEFORE this item if dropState says so
							const showIndicatorBefore =
								dropState?.intent === "reorder" &&
								dropState.beforeId === item.dndId;

							if (item.type === "group") {
								const isGroupDragOver =
									dropState?.intent === "join-group" &&
									dropState.groupId === item.group.id;
								return (
									<div key={item.group.id} data-dnd-item={item.dndId}>
										{showIndicatorBefore && <DropIndicator />}
										<ProjectGroupNavItem
											group={item.group}
											projects={item.projects}
											collapsed={sidebarCollapsed}
											isDragOver={isGroupDragOver}
										/>
									</div>
								);
							}

							const isMergeTarget =
								dropState?.intent === "merge" &&
								dropState.targetId === item.dndId;

							// Detect if this project is inside a group
							const groupId = item.project.groupId;

							// Detect if this is the last child of its group
							const nextItem = sidebarItems[index + 1];
							const isLastInGroup =
								groupId !== null &&
								groupId !== undefined &&
								(!nextItem ||
									nextItem.type === "group" ||
									(nextItem.type === "project" &&
										nextItem.project.groupId !== groupId));

							return (
								<div key={item.project.id}>
									<div data-dnd-item={item.dndId}>
										{showIndicatorBefore && <DropIndicator />}
										<ProjectNavItem
											project={item.project}
											active={selectedProjectId === item.project.id}
											collapsed={sidebarCollapsed}
											onClick={() => setSelectedProject(item.project.id)}
											isMergeTarget={isMergeTarget}
											itemRef={makeItemRef(item.dndId)}
										/>
									</div>
									{isLastInGroup && !sidebarCollapsed && (
										<div className="mx-3 mb-1.5 h-px bg-sidebar-border/60" />
									)}
								</div>
							);
						})}
						{/* DropIndicator at the END of the list */}
						{dropState?.intent === "reorder" && dropState.beforeId === null && (
							<DropIndicator />
						)}
						<DragOverlay>
							{activeProjectId ? (
								<div className="dnd-dragging opacity-90 rounded-md bg-sidebar-accent px-3 py-2 text-sm shadow-lg cursor-grabbing">
									{projects.find((p) => p.id === activeProjectId)?.name}
								</div>
							) : null}
						</DragOverlay>
					</DndContext>
					{pendingGroupProjects && (
						<CreateGroupDialog
							open={true}
							projectA={pendingGroupProjects.projectA}
							projectB={pendingGroupProjects.projectB}
							onConfirm={() => setPendingGroupProjects(null)}
							onCancel={() => setPendingGroupProjects(null)}
						/>
					)}
					{sidebarCollapsed && (
						<ProjectForm>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
								aria-label={t("project.new")}
							>
								<Plus className="h-4 w-4" />
							</Button>
						</ProjectForm>
					)}
				</div>
			</ScrollArea>

			<SettingsDialog>
				<div className="border-t border-sidebar-border px-2 py-2 shrink-0">
					<button
						type="button"
						aria-label={t("settings.title")}
						className={cn(
							"flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm transition-colors",
							"border-l-2 border-transparent",
							"text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
							sidebarCollapsed && "justify-center",
						)}
					>
						<Settings2 className="h-4 w-4 shrink-0" />
						{!sidebarCollapsed && (
							<span className="truncate">{t("settings.title")}</span>
						)}
					</button>
				</div>
			</SettingsDialog>
		</div>
	);
}
