import {
	ArchiveX,
	Calendar,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	ListChecks,
	MoreVertical,
	Pencil,
	Plus,
	Settings2,
	Tags,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import logoUrl from "@/assets/logo.png";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { DeleteProjectDialog } from "@/components/projects/DeleteProjectDialog";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project } from "@/types";

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
}

function ProjectNavItem({
	project,
	active,
	collapsed,
	onClick,
}: ProjectNavItemProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const { deleteProject } = useProjectStore();
	const { selectedProjectId, setSelectedProject } = useUIStore();
	const { t } = useTranslation();

	async function handleConfirmDelete(
		options: import("@/components/projects/DeleteProjectDialog").DeleteProjectOptions,
	) {
		setDeleteOpen(false);
		const repo = getRepository();
		const { tagAction, taskAction, targetProjectId, targetTagProjectId, summary } = options;

		// --- Tags: update DB then sync store so deleteProject's filter sees the new projectIds ---
		const tagIds = new Set(summary.tags.map((t) => t.id));
		if (tagAction === "generic") {
			await Promise.all(
				summary.tags.map((tag) =>
					repo.updateTag(tag.id, { name: tag.name, color: tag.color ?? undefined, projectId: null }),
				),
			);
			useTagStore.setState((s) => ({
				tags: s.tags.map((t) => (tagIds.has(t.id) ? { ...t, projectId: null } : t)),
			}));
		} else if (tagAction === "project" && targetTagProjectId) {
			await Promise.all(
				summary.tags.map((tag) =>
					repo.updateTag(tag.id, { name: tag.name, color: tag.color ?? undefined, projectId: targetTagProjectId }),
				),
			);
			useTagStore.setState((s) => ({
				tags: s.tags.map((t) => (tagIds.has(t.id) ? { ...t, projectId: targetTagProjectId } : t)),
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
			await Promise.all(
				allTasks.map((task) => repo.updateTask(task.id, { projectId: null })),
			);
			useTaskStore.setState((s) => ({
				tasks: s.tasks.map((t) => (allTaskIds.has(t.id) ? { ...t, projectId: null } : t)),
			}));
		} else if (taskAction === "project" && targetProjectId) {
			await Promise.all(
				allTasks.map((task) =>
					repo.updateTask(task.id, { projectId: targetProjectId }),
				),
			);
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

	const iconDef =
		PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
	const ProjectIcon = iconDef.icon;

	const icon = (
		<ProjectIcon
			className="h-4 w-4 shrink-0"
			style={{ color: project.color ?? undefined }}
		/>
	);

	return (
		<>
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
						)}
						onClick={onClick}
						onContextMenu={(e) => {
							if (collapsed) return;
							e.preventDefault();
							e.stopPropagation();
							setMenuOpen(true);
						}}
					>
						{icon}
						{!collapsed && (
							<>
								<span className="truncate flex-1 text-left">
									{project.name}
								</span>
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
		</>
	);
}

export function Sidebar() {
	const { t } = useTranslation();
	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		selectedProjectId,
		setSelectedProject,
	} = useUIStore();
	const projects = useProjectStore((s) => s.projects);
	const allCount = useTaskStore((s) => s.allCount);
	const todayCount = useTaskStore((s) => s.todayCount);
	const calendarVisible = useSettingsStore((s) => s.calendarVisible);
	const archivesVisible = useSettingsStore((s) => s.archivesVisible);
	const tagsVisible = useSettingsStore((s) => s.tagsVisible);

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
					{projects.map((project) => (
						<ProjectNavItem
							key={project.id}
							project={project}
							active={selectedProjectId === project.id}
							collapsed={sidebarCollapsed}
							onClick={() => setSelectedProject(project.id)}
						/>
					))}
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
