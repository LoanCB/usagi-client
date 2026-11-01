import { Dialog } from "@base-ui/react/dialog";
import { Command, useCommandState } from "cmdk";
import {
	ArchiveIcon,
	ArchiveXIcon,
	CalendarDaysIcon,
	CalendarIcon,
	CheckIcon,
	CircleIcon,
	ListChecksIcon,
	type LucideIcon,
	SearchIcon,
	TagsIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useArchiveStore } from "@/store/archives";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSearchStore } from "@/store/search";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project, Tag, Task } from "@/types";

const TASK_LIMIT = 5;
const PROJECT_LIMIT = 3;
const TAG_LIMIT = 3;

interface ViewItem {
	readonly id: string;
	/** undefined is the "All tasks" selection (see useUIStore). */
	readonly target: string | undefined;
	readonly label: string;
	readonly icon: LucideIcon;
}

const GROUP_HEADING_CLASS =
	"[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

const ITEM_CLASS =
	"flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent";

function SelectedValueTracker({
	valueRef,
}: {
	valueRef: React.RefObject<string>;
}) {
	const value = useCommandState((state) => state.value);
	valueRef.current = value;
	return null;
}

// The "press Tab on a task" mode: offers complete/uncomplete + archive.
function QuickActions({
	target,
	onComplete,
	onArchive,
}: {
	readonly target: Task;
	readonly onComplete: (task: Task) => void;
	readonly onArchive: (task: Task) => void;
}) {
	const { t } = useTranslation();
	return (
		<Command.Group
			heading={t("search.actionsHint")}
			className={GROUP_HEADING_CLASS}
		>
			<Command.Item
				value="action-complete"
				onSelect={() => onComplete(target)}
				className={ITEM_CLASS}
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-500">
					<CheckIcon className="size-3.5" />
				</span>
				{target.completedAt ? t("search.uncomplete") : t("search.complete")}
			</Command.Item>
			<Command.Item
				value="action-archive"
				onSelect={() => onArchive(target)}
				className={ITEM_CLASS}
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<ArchiveIcon className="size-3.5" />
				</span>
				{t("search.archive")}
			</Command.Item>
		</Command.Group>
	);
}

function ViewResults({
	views,
	onSelect,
}: {
	readonly views: ViewItem[];
	readonly onSelect: (target: string | undefined) => void;
}) {
	const { t } = useTranslation();
	return (
		<Command.Group heading={t("nav.views")} className={GROUP_HEADING_CLASS}>
			{views.map((view) => {
				const ViewIcon = view.icon;
				return (
					<Command.Item
						key={view.id}
						value={`view-${view.id}`}
						onSelect={() => onSelect(view.target)}
						className={ITEM_CLASS}
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
							<ViewIcon className="size-4" />
						</span>
						<span className="truncate">{view.label}</span>
					</Command.Item>
				);
			})}
		</Command.Group>
	);
}

function TaskResults({
	tasks,
	isArchived,
	onSelect,
}: {
	readonly tasks: Task[];
	readonly isArchived: (task: Task) => boolean;
	readonly onSelect: (task: Task) => void;
}) {
	const { t } = useTranslation();
	const badgeFor = (task: Task) => {
		if (isArchived(task)) return t("search.archived");
		if (task.completedAt) return t("search.completed");
		return null;
	};
	return (
		<Command.Group heading={t("search.tasks")} className={GROUP_HEADING_CLASS}>
			{tasks.map((task) => {
				const badge = badgeFor(task);
				const isCompleted = Boolean(task.completedAt);
				return (
					<Command.Item
						key={task.id}
						value={task.id}
						onSelect={() => onSelect(task)}
						className={cn("group", ITEM_CLASS)}
					>
						<span
							className={cn(
								"flex size-7 shrink-0 items-center justify-center rounded-md",
								isCompleted
									? "bg-green-500/10 text-green-500"
									: "bg-muted text-muted-foreground",
							)}
						>
							{isCompleted ? (
								<CheckIcon className="size-3.5" />
							) : (
								<CircleIcon className="size-3.5" />
							)}
						</span>
						<span className="min-w-0 flex-1">
							<span
								className={cn(
									"block truncate",
									isCompleted && "text-muted-foreground line-through",
								)}
							>
								{task.title}
							</span>
							{badge && (
								<span className="text-xs text-muted-foreground">{badge}</span>
							)}
						</span>
						<span className="hidden items-center gap-1 group-data-[selected=true]:flex">
							<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
								↵
							</kbd>
							<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
								⇥
							</kbd>
						</span>
					</Command.Item>
				);
			})}
		</Command.Group>
	);
}

function ProjectResults({
	projects,
	archivedIds,
	onSelect,
}: {
	readonly projects: Project[];
	readonly archivedIds: ReadonlySet<string>;
	readonly onSelect: (projectId: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<Command.Group
			heading={t("search.projects")}
			className={GROUP_HEADING_CLASS}
		>
			{projects.map((project) => {
				const iconDef =
					PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
				const ProjectIcon = iconDef.icon;
				return (
					<Command.Item
						key={project.id}
						value={`project-${project.id}`}
						onSelect={() => onSelect(project.id)}
						className={ITEM_CLASS}
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
							<ProjectIcon
								className="size-4"
								style={{ color: project.color ?? undefined }}
							/>
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate">{project.name}</span>
							{archivedIds.has(project.id) && (
								<span className="text-xs text-muted-foreground">
									{t("search.projectArchived")}
								</span>
							)}
						</span>
					</Command.Item>
				);
			})}
		</Command.Group>
	);
}

function TagResults({
	tags,
	onSelect,
}: {
	readonly tags: Tag[];
	readonly onSelect: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Command.Group heading={t("search.tags")} className={GROUP_HEADING_CLASS}>
			{tags.map((tag) => (
				<Command.Item
					key={tag.id}
					value={`tag-${tag.id}`}
					onSelect={() => onSelect()}
					className={ITEM_CLASS}
				>
					<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
						<GroupColorShape
							color={tag.color ?? "#71717a"}
							size={10}
							className="shrink-0"
						/>
					</span>
					<span className="truncate">{tag.name}</span>
				</Command.Item>
			))}
		</Command.Group>
	);
}

function SearchResults({
	views,
	tasks,
	projects,
	archivedProjectIds,
	isArchived,
	tags,
	onSelectView,
	onSelectTask,
	onSelectProject,
	onSelectTag,
}: {
	readonly views: ViewItem[];
	readonly tasks: Task[];
	readonly projects: Project[];
	readonly archivedProjectIds: ReadonlySet<string>;
	readonly isArchived: (task: Task) => boolean;
	readonly tags: Tag[];
	readonly onSelectView: (target: string | undefined) => void;
	readonly onSelectTask: (task: Task) => void;
	readonly onSelectProject: (projectId: string) => void;
	readonly onSelectTag: () => void;
}) {
	return (
		<>
			{views.length > 0 && (
				<ViewResults views={views} onSelect={onSelectView} />
			)}
			{tasks.length > 0 && (
				<TaskResults
					tasks={tasks}
					isArchived={isArchived}
					onSelect={onSelectTask}
				/>
			)}
			{projects.length > 0 && (
				<ProjectResults
					projects={projects}
					archivedIds={archivedProjectIds}
					onSelect={onSelectProject}
				/>
			)}
			{tags.length > 0 && <TagResults tags={tags} onSelect={onSelectTag} />}
		</>
	);
}

function SearchFooter({ mode }: { readonly mode: "search" | "action" }) {
	const { t } = useTranslation();
	if (mode === "action") {
		return (
			<div className="flex items-center gap-4 border-t border-border bg-muted/30 px-3 py-2">
				<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
					<kbd className="font-mono">ESC</kbd>
					{t("search.back")}
				</span>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-4 border-t border-border bg-muted/30 px-3 py-2">
			<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
				<kbd className="font-mono">↑↓</kbd>
				{t("search.navigateHint")}
			</span>
			<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
				<kbd className="font-mono">↵</kbd>
				{t("search.openHint")}
			</span>
			<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
				<kbd className="font-mono">⇥</kbd>
				{t("search.actionsHint")}
			</span>
		</div>
	);
}

/** Same list and visibility rules as the sidebar's views. */
function useFilteredViews(q: string): ViewItem[] {
	const { t } = useTranslation();
	const tagsVisible = useSettingsStore((s) => s.tagsVisible);
	const calendarVisible = useSettingsStore((s) => s.calendarVisible);
	const archivesVisible = useSettingsStore((s) => s.archivesVisible);
	return useMemo(() => {
		const views: ViewItem[] = [
			{
				id: "today",
				target: "today",
				label: t("nav.today"),
				icon: CalendarIcon,
			},
			{
				id: "all",
				target: undefined,
				label: t("nav.allTasks"),
				icon: ListChecksIcon,
			},
		];
		if (tagsVisible) {
			views.push({
				id: "tags",
				target: "tags",
				label: t("nav.tags"),
				icon: TagsIcon,
			});
		}
		if (calendarVisible) {
			views.push({
				id: "calendar",
				target: "calendar",
				label: t("nav.calendar"),
				icon: CalendarDaysIcon,
			});
		}
		if (archivesVisible) {
			views.push({
				id: "archives",
				target: "archives",
				label: t("nav.archives"),
				icon: ArchiveXIcon,
			});
		}
		return views.filter((view) => view.label.toLowerCase().includes(q));
	}, [t, tagsVisible, calendarVisible, archivesVisible, q]);
}

export function GlobalSearch() {
	const { isOpen, close } = useSearchStore();
	const [query, setQuery] = useState("");
	const [quickActionTarget, setQuickActionTarget] = useState<Task | null>(null);
	const { t } = useTranslation();

	const tasks = useTaskStore((s) => s.tasks);
	const archivedTasks = useTaskStore((s) => s.archivedTasks);
	const loadArchivedTasks = useTaskStore((s) => s.loadArchivedTasks);
	const completeTask = useTaskStore((s) => s.completeTask);
	const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
	const archiveTask = useTaskStore((s) => s.archiveTask);
	const projects = useProjectStore((s) => s.projects);
	const archivedProjects = useArchiveStore((s) => s.projects);
	const archivedProjectTasks = useArchiveStore((s) => s.tasks);
	const tags = useTagStore((s) => s.tags);
	const navigateToTask = useUIStore((s) => s.navigateToTask);
	const setSelectedProject = useUIStore((s) => s.setSelectedProject);

	const selectedValueRef = useRef<string>("");

	useEffect(() => {
		if (isOpen && archivedTasks.length === 0) {
			loadArchivedTasks(getRepository());
		}
	}, [isOpen, archivedTasks.length, loadArchivedTasks]);

	function handleClose() {
		close();
		setQuery("");
		setQuickActionTarget(null);
		selectedValueRef.current = "";
	}

	const q = query.toLowerCase();
	const filteredViews = useFilteredViews(q);

	const archivedProjectIds = useMemo(
		() => new Set(archivedProjects.map((p) => p.id)),
		[archivedProjects],
	);

	const isArchived = (task: Task) =>
		task.deletedAt !== null ||
		(task.projectId !== null && archivedProjectIds.has(task.projectId));

	const filteredTasks = useMemo(() => {
		// By id: `tasks` already holds archivedProjectTasks while one of those
		// projects is open.
		const candidates = new Map(
			[...tasks, ...archivedTasks, ...archivedProjectTasks].map((task) => [
				task.id,
				task,
			]),
		);
		return [...candidates.values()]
			.filter((task) => task.title.toLowerCase().includes(q))
			.slice(0, TASK_LIMIT);
	}, [tasks, archivedTasks, archivedProjectTasks, q]);

	const filteredProjects = useMemo(
		() =>
			[...projects, ...archivedProjects]
				.filter((p) => p.name.toLowerCase().includes(q))
				.slice(0, PROJECT_LIMIT),
		[projects, archivedProjects, q],
	);

	const filteredTags = useMemo(
		() =>
			tags
				.filter((tag) => tag.name.toLowerCase().includes(q))
				.slice(0, TAG_LIMIT),
		[tags, q],
	);

	function handleSelectTask(task: Task) {
		navigateToTask(task.projectId, task.id);
		handleClose();
	}

	function handleSelectProject(projectId: string) {
		setSelectedProject(projectId);
		handleClose();
	}

	function handleSelectView(target: string | undefined) {
		setSelectedProject(target);
		handleClose();
	}

	function handleSelectTag() {
		setSelectedProject("tags");
		handleClose();
	}

	function handleCommandKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Tab" && !quickActionTarget) {
			const task = filteredTasks.find(
				(task) => task.id === selectedValueRef.current,
			);
			if (task && !isArchived(task)) {
				e.preventDefault();
				setQuickActionTarget(task);
				setQuery("");
			} else if (selectedValueRef.current) {
				// Non-task item or archived task — swallow Tab to avoid focus escaping
				e.preventDefault();
			}
		}
		if (e.key === "Escape" && quickActionTarget) {
			e.preventDefault();
			e.stopPropagation();
			setQuickActionTarget(null);
		}
	}

	async function handleQuickComplete(task: Task) {
		const repo = getRepository();
		if (task.completedAt) {
			await uncompleteTask(repo, task.id);
		} else {
			await completeTask(repo, task.id);
		}
		handleClose();
	}

	async function handleQuickArchive(task: Task) {
		await archiveTask(getRepository(), task.id);
		handleClose();
	}

	return (
		<Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
				<Dialog.Popup
					className={cn(
						"fixed left-1/2 top-[20%] z-50 w-full max-w-[580px] -translate-x-1/2",
						"outline-none",
						"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
						"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
					)}
				>
					<Command
						shouldFilter={false}
						onKeyDown={handleCommandKeyDown}
						className="overflow-hidden rounded-xl bg-popover shadow-2xl ring-1 ring-foreground/10"
					>
						<SelectedValueTracker valueRef={selectedValueRef} />

						{/* Input row */}
						<div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
							<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
							<div className="relative flex-1">
								{quickActionTarget && (
									<span className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-sm text-foreground">
										{quickActionTarget.title}
									</span>
								)}
								<Command.Input
									value={quickActionTarget ? "" : query}
									onValueChange={quickActionTarget ? undefined : setQuery}
									placeholder={quickActionTarget ? "" : t("search.placeholder")}
									className={cn(
										"w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground",
										quickActionTarget && "opacity-0",
									)}
									autoFocus
								/>
							</div>
							<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
								ESC
							</kbd>
						</div>

						{/* Results list */}
						<Command.List className="max-h-[380px] overflow-y-auto p-1">
							<Command.Empty className="py-8 text-center text-sm text-muted-foreground">
								{t("search.noResults")}
							</Command.Empty>

							{quickActionTarget ? (
								<QuickActions
									target={quickActionTarget}
									onComplete={handleQuickComplete}
									onArchive={handleQuickArchive}
								/>
							) : (
								<SearchResults
									views={filteredViews}
									tasks={filteredTasks}
									projects={filteredProjects}
									archivedProjectIds={archivedProjectIds}
									isArchived={isArchived}
									tags={filteredTags}
									onSelectView={handleSelectView}
									onSelectTask={handleSelectTask}
									onSelectProject={handleSelectProject}
									onSelectTag={handleSelectTag}
								/>
							)}
						</Command.List>

						{/* Footer */}
						<SearchFooter mode={quickActionTarget ? "action" : "search"} />
					</Command>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
