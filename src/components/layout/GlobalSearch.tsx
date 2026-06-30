import { Dialog } from "@base-ui/react/dialog";
import { Command, useCommandState } from "cmdk";
import { ArchiveIcon, CheckIcon, CircleIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSearchStore } from "@/store/search";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project, Tag, Task } from "@/types";

const TASK_LIMIT = 5;
const PROJECT_LIMIT = 3;
const TAG_LIMIT = 3;

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

function TaskResults({
	tasks,
	onSelect,
}: {
	readonly tasks: Task[];
	readonly onSelect: (task: Task) => void;
}) {
	const { t } = useTranslation();
	const badgeFor = (task: Task) => {
		if (task.deletedAt) return t("search.archived");
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
	onSelect,
}: {
	readonly projects: Project[];
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
						<span className="truncate">{project.name}</span>
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

	const filteredTasks = useMemo(
		() =>
			[...tasks, ...archivedTasks]
				.filter((task) => task.title.toLowerCase().includes(q))
				.slice(0, TASK_LIMIT),
		[tasks, archivedTasks, q],
	);

	const filteredProjects = useMemo(
		() =>
			projects
				.filter((p) => p.name.toLowerCase().includes(q))
				.slice(0, PROJECT_LIMIT),
		[projects, q],
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

	function handleSelectTag() {
		setSelectedProject("tags");
		handleClose();
	}

	function handleCommandKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Tab" && !quickActionTarget) {
			const task = filteredTasks.find(
				(task) => task.id === selectedValueRef.current,
			);
			if (task && !task.deletedAt) {
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

							{quickActionTarget && (
								<QuickActions
									target={quickActionTarget}
									onComplete={handleQuickComplete}
									onArchive={handleQuickArchive}
								/>
							)}

							{!quickActionTarget && filteredTasks.length > 0 && (
								<TaskResults
									tasks={filteredTasks}
									onSelect={handleSelectTask}
								/>
							)}

							{!quickActionTarget && filteredProjects.length > 0 && (
								<ProjectResults
									projects={filteredProjects}
									onSelect={handleSelectProject}
								/>
							)}

							{!quickActionTarget && filteredTags.length > 0 && (
								<TagResults tags={filteredTags} onSelect={handleSelectTag} />
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
