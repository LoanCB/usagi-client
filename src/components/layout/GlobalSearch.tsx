import { Dialog } from "@base-ui/react/dialog";
import { Command, useCommandState } from "cmdk";
import { ArchiveIcon, CheckIcon, CircleIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSearchStore } from "@/store/search";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";

const TASK_LIMIT = 5;
const PROJECT_LIMIT = 3;
const TAG_LIMIT = 3;

const GROUP_HEADING_CLASS =
	"[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

function SelectedValueTracker({
	onValueChange,
}: {
	onValueChange: (value: string) => void;
}) {
	const value = useCommandState((state) => state.value);
	useEffect(() => {
		onValueChange(value);
	}, [value, onValueChange]);
	return null;
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only runs on open, not on every archivedTasks change
	useEffect(() => {
		if (isOpen && archivedTasks.length === 0) {
			loadArchivedTasks(getRepository());
		}
	}, [isOpen]);

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

	function taskBadge(task: Task): string | null {
		if (task.deletedAt) return t("search.archived");
		if (task.completedAt) return t("search.completed");
		return null;
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
						<SelectedValueTracker
							onValueChange={(v) => {
								selectedValueRef.current = v;
							}}
						/>

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

							{/* Quick actions mode */}
							{quickActionTarget && (
								<Command.Group
									heading={t("search.actionsHint")}
									className={GROUP_HEADING_CLASS}
								>
									<Command.Item
										value="action-complete"
										onSelect={() => handleQuickComplete(quickActionTarget)}
										className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent"
									>
										<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-500">
											<CheckIcon className="size-3.5" />
										</span>
										{quickActionTarget.completedAt
											? t("search.uncomplete")
											: t("search.complete")}
									</Command.Item>
									<Command.Item
										value="action-archive"
										onSelect={() => handleQuickArchive(quickActionTarget)}
										className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent"
									>
										<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
											<ArchiveIcon className="size-3.5" />
										</span>
										{t("search.archive")}
									</Command.Item>
								</Command.Group>
							)}

							{/* Tasks */}
							{!quickActionTarget && filteredTasks.length > 0 && (
								<Command.Group
									heading={t("search.tasks")}
									className={GROUP_HEADING_CLASS}
								>
									{filteredTasks.map((task) => {
										const badge = taskBadge(task);
										const isCompleted = Boolean(task.completedAt);
										return (
											<Command.Item
												key={task.id}
												value={task.id}
												onSelect={() => handleSelectTask(task)}
												className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent"
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
															isCompleted &&
																"text-muted-foreground line-through",
														)}
													>
														{task.title}
													</span>
													{badge && (
														<span className="text-xs text-muted-foreground">
															{badge}
														</span>
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
							)}

							{/* Projects */}
							{!quickActionTarget && filteredProjects.length > 0 && (
								<Command.Group
									heading={t("search.projects")}
									className={GROUP_HEADING_CLASS}
								>
									{filteredProjects.map((project) => {
										const iconDef =
											PRESET_ICONS.find((i) => i.name === project.icon) ??
											PRESET_ICONS[0];
										const ProjectIcon = iconDef.icon;
										return (
											<Command.Item
												key={project.id}
												value={`project-${project.id}`}
												onSelect={() => handleSelectProject(project.id)}
												className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent"
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
							)}

							{/* Tags */}
							{!quickActionTarget && filteredTags.length > 0 && (
								<Command.Group
									heading={t("search.tags")}
									className={GROUP_HEADING_CLASS}
								>
									{filteredTags.map((tag) => (
										<Command.Item
											key={tag.id}
											value={`tag-${tag.id}`}
											onSelect={() => handleSelectTag()}
											className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent"
										>
											<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
												<span
													className="size-2.5 rounded-full"
													style={{ background: tag.color ?? "#71717a" }}
												/>
											</span>
											<span className="truncate">{tag.name}</span>
										</Command.Item>
									))}
								</Command.Group>
							)}
						</Command.List>

						{/* Footer */}
						{!quickActionTarget && (
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
						)}
						{quickActionTarget && (
							<div className="flex items-center gap-4 border-t border-border bg-muted/30 px-3 py-2">
								<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
									<kbd className="font-mono">ESC</kbd>
									{t("search.back")}
								</span>
							</div>
						)}
					</Command>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
