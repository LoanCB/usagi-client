import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { Plus, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterBar } from "@/components/tasks/FilterBar";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskItem } from "@/components/tasks/TaskItem";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { matchesShortcut } from "@/lib/shortcuts";
import { todayIso } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useShortcutsStore } from "@/store/shortcuts";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";

function DropLine() {
	return (
		<div className="flex items-center mx-3 my-0.5 pointer-events-none">
			<div className="w-2 h-2 rounded-full bg-primary shrink-0" />
			<div className="flex-1 h-0.5 bg-primary" />
		</div>
	);
}

const PRIORITY_WEIGHT: Record<string, number> = {
	high: 3,
	medium: 2,
	low: 1,
	none: 0,
};

function byUrgency(a: Task, b: Task): number {
	const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
	if (pw !== 0) return pw;
	if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
	if (a.dueDate) return -1;
	if (b.dueDate) return 1;
	return 0;
}

function byDueDate(a: Task, b: Task): number {
	if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
	if (a.dueDate) return -1;
	if (b.dueDate) return 1;
	return 0;
}

function byProjectName(projectMap: Map<string, string>) {
	return (a: Task, b: Task): number => {
		const pa = a.projectId ? (projectMap.get(a.projectId) ?? "") : "";
		const pb = b.projectId ? (projectMap.get(b.projectId) ?? "") : "";
		// Inbox (no project) goes last
		if (!a.projectId && b.projectId) return 1;
		if (a.projectId && !b.projectId) return -1;
		return pa.localeCompare(pb);
	};
}

export function TaskList() {
	const { t, i18n } = useTranslation();
	const { tasks, loadTasks, reorderTasks, deleteTask } = useTaskStore();
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const projects = useProjectStore((s) => s.projects);
	const { selectedProjectId, activeFilters, selectedTaskId, setSelectedTask } =
		useUIStore();

	const currentProject = projects.find((p) => p.id === selectedProjectId);
	const [search, setSearch] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);
	const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
	const [sortDateDir, setSortDateDir] = useState<"asc" | "desc" | null>(null);
	const [sortProjectDir, setSortProjectDir] = useState<"asc" | "desc" | null>(
		null,
	);

	function getTitle() {
		if (selectedProjectId === null) return t("nav.inbox");
		if (selectedProjectId === "today") return t("nav.today");
		if (selectedProjectId === undefined) return t("nav.allTasks");
		return currentProject?.name ?? t("task.projectFallback");
	}

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	useEffect(() => {
		if (selectedProjectId === "tags") return;
		const repo = getRepository();
		if (selectedProjectId === "today") {
			loadTasks(repo, { ...activeFilters, dueBefore: todayIso() });
		} else {
			loadTasks(repo, { ...activeFilters, projectId: selectedProjectId });
		}
	}, [selectedProjectId, activeFilters, loadTasks]);

	const displayedTasks = useMemo(() => {
		if (sortDir !== null) {
			const sorted = [...tasks].sort(byUrgency);
			return sortDir === "desc" ? sorted.reverse() : sorted;
		}
		if (sortDateDir !== null) {
			const sorted = [...tasks].sort(byDueDate);
			return sortDateDir === "desc" ? sorted.reverse() : sorted;
		}
		if (sortProjectDir !== null) {
			const projectMap = new Map(projects.map((p) => [p.id, p.name]));
			const sorted = [...tasks].sort(byProjectName(projectMap));
			return sortProjectDir === "desc" ? sorted.reverse() : sorted;
		}
		return tasks;
	}, [tasks, sortDir, sortDateDir, sortProjectDir, projects]);

	const hasSortActive =
		sortDir !== null || sortDateDir !== null || sortProjectDir !== null;

	function resetSort() {
		setSortDir(null);
		setSortDateDir(null);
		setSortProjectDir(null);
	}

	function sortByUrgency() {
		if (sortDir === "desc") {
			setSortDir(null);
			return;
		}
		setSortDir(sortDir === null ? "asc" : "desc");
		setSortDateDir(null);
		setSortProjectDir(null);
	}

	function sortByDueDate() {
		if (sortDateDir === "desc") {
			setSortDateDir(null);
			return;
		}
		setSortDateDir(sortDateDir === null ? "asc" : "desc");
		setSortDir(null);
		setSortProjectDir(null);
	}

	function sortByProject() {
		if (sortProjectDir === "desc") {
			setSortProjectDir(null);
			return;
		}
		setSortProjectDir(sortProjectDir === null ? "asc" : "desc");
		setSortDir(null);
		setSortDateDir(null);
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;

			// Escape (no modifiers) closes task detail
			if (
				e.key === "Escape" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey &&
				selectedTaskId
			) {
				setSelectedTask(null);
				return;
			}

			const { sortUrgency, sortDueDate, sortProject } =
				useShortcutsStore.getState();
			if (matchesShortcut(e, sortUrgency)) {
				e.preventDefault();
				sortByUrgency();
				return;
			}
			if (matchesShortcut(e, sortDueDate)) {
				e.preventDefault();
				sortByDueDate();
				return;
			}
			if (matchesShortcut(e, sortProject) && selectedProjectId === undefined) {
				e.preventDefault();
				sortByProject();
			}
		}
		globalThis.addEventListener("keydown", handleKeyDown);
		return () => globalThis.removeEventListener("keydown", handleKeyDown);
	}, [
		selectedTaskId,
		setSelectedTask,
		// biome-ignore lint/correctness/useExhaustiveDependencies: inline functions, sort state managed via Zustand .getState()
		sortByUrgency,
		// biome-ignore lint/correctness/useExhaustiveDependencies: inline functions, sort state managed via Zustand .getState()
		sortByDueDate,
		// biome-ignore lint/correctness/useExhaustiveDependencies: inline functions, sort state managed via Zustand .getState()
		sortByProject,
		selectedProjectId,
	]);

	function handleDragStart(event: DragStartEvent) {
		setActiveId(event.active.id as string);
	}

	function handleDragOver(event: DragOverEvent) {
		setOverId((event.over?.id as string) ?? null);
	}

	function handleDragEnd(event: DragEndEvent) {
		setActiveId(null);
		setOverId(null);
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = displayedTasks.findIndex((t) => t.id === active.id);
		const newIndex = displayedTasks.findIndex((t) => t.id === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const reordered = arrayMove(displayedTasks, oldIndex, newIndex);
		resetSort();
		reorderTasks(
			getRepository(),
			reordered.map((t) => t.id),
		);
	}

	const formProjectId =
		selectedProjectId === "today" || selectedProjectId === undefined
			? null
			: selectedProjectId;

	return (
		<div className="flex flex-col flex-1 min-w-0 overflow-hidden">
			{/* Header */}
			{(() => {
				const showProgress =
					selectedProjectId === "today" || selectedProjectId === undefined;
				const totalCount = tasks.length;
				const completedCount = tasks.filter((t) => t.completedAt).length;
				const remainingCount = totalCount - completedCount;
				const locale = i18n.language === "fr" ? fr : enUS;
				const dateLabel = format(new Date(), "EEEE d MMMM", { locale });

				return (
					<div className="glass-header px-5 pt-5 pb-3 shrink-0">
						<div className="flex items-center justify-between mb-1">
							<div>
								<h2 className="font-bold text-xl tracking-tight">
									{getTitle()}
								</h2>
								{showProgress && (
									<div className="flex items-center gap-2 mt-1">
										<span className="text-xs text-muted-foreground capitalize">
											{dateLabel}
										</span>
										<span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold border border-primary/30">
											{t("taskList.remaining", { count: remainingCount })}
										</span>
									</div>
								)}
							</div>
							<div className="flex items-center gap-2">
								{/* Search */}
								<div className="glass-stat flex items-center gap-2 rounded-xl px-3 py-1.5">
									<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
									<input
										type="text"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder={t("task.search")}
										aria-label={t("task.search")}
										className="w-48 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
									/>
									<button
										type="button"
										onClick={() => setSearch("")}
										className={`shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors ${search ? "visible" : "invisible"}`}
										aria-label="Clear search"
										tabIndex={search ? 0 : -1}
									>
										<X className="h-3.5 w-3.5" />
									</button>
								</div>
								{/* New task */}
								<TaskForm projectId={formProjectId}>
									<button
										type="button"
										aria-label={t("task.new")}
										className="glass-stat flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
									>
										<Plus className="h-4 w-4" />
									</button>
								</TaskForm>
							</div>
						</div>

						{/* Stats cards */}
						{showProgress && (
							<div className="flex gap-2 mt-3">
								{[
									{
										label: t("taskList.statPending"),
										value: remainingCount,
										className: "text-primary",
									},
									{
										label: t("taskList.statDone"),
										value: completedCount,
										className: "text-[var(--priority-low)]",
									},
									{
										label: t("taskList.statTotal"),
										value: totalCount,
										className: "text-muted-foreground",
									},
								].map((s) => (
									<div
										key={s.label}
										className="glass-stat flex flex-1 items-center gap-2.5 rounded-xl px-4 py-2.5"
									>
										<span className={`text-xl font-bold ${s.className}`}>
											{s.value}
										</span>
										<span className="text-xs text-muted-foreground font-medium">
											{s.label}
										</span>
									</div>
								))}
							</div>
						)}

						{showProgress && (
							<div
								role="progressbar"
								aria-label={t("taskList.progressLabel")}
								aria-valuenow={completedCount}
								aria-valuemin={0}
								aria-valuemax={totalCount}
								aria-valuetext={`${completedCount} / ${totalCount}`}
								className="mt-3 h-1 rounded-full bg-primary/15 overflow-hidden"
							>
								<div
									className="h-full rounded-full bg-primary transition-all duration-300"
									style={{
										width:
											totalCount > 0
												? `${(completedCount / totalCount) * 100}%`
												: "0%",
									}}
								/>
							</div>
						)}
					</div>
				);
			})()}

			<FilterBar
				sortDir={sortDir}
				sortDateDir={sortDateDir}
				sortProjectDir={sortProjectDir}
				hasSortActive={hasSortActive}
				onSortByUrgency={sortByUrgency}
				onSortByDueDate={sortByDueDate}
				onSortByProject={
					selectedProjectId === undefined ? sortByProject : undefined
				}
				onResetSort={resetSort}
			/>

			<ScrollArea className="flex-1 min-h-0">
				{(() => {
					const filteredTasks = search.trim()
						? displayedTasks.filter((t) =>
								t.title.toLowerCase().includes(search.toLowerCase()),
							)
						: displayedTasks;

					if (filteredTasks.length === 0) {
						return (
							<p className="text-center text-muted-foreground text-sm py-12">
								{t("task.noTasks")}
							</p>
						);
					}

					if (search.trim()) {
						return (
							<div>
								{filteredTasks.map((task) => (
									<TaskItem
										key={task.id}
										task={task}
										project={
											selectedProjectId === undefined
												? projects.find((p) => p.id === task.projectId)
												: undefined
										}
										onDeleteRequest={setConfirmDeleteId}
									/>
								))}
							</div>
						);
					}

					const ai = filteredTasks.findIndex((t) => t.id === activeId);
					const oi = filteredTasks.findIndex((t) => t.id === overId);
					let insertBefore: number | null = null;
					if (
						activeId &&
						overId &&
						activeId !== overId &&
						ai !== -1 &&
						oi !== -1
					) {
						insertBefore = ai < oi ? oi + 1 : oi;
					}

					const sortableItems: ReactNode[] = [];
					filteredTasks.forEach((task, i) => {
						if (insertBefore === i)
							sortableItems.push(<DropLine key="drop-line" />);
						sortableItems.push(
							<TaskItem
								key={task.id}
								task={task}
								project={
									selectedProjectId === undefined
										? projects.find((p) => p.id === task.projectId)
										: undefined
								}
								onDeleteRequest={setConfirmDeleteId}
							/>,
						);
					});
					if (insertBefore === filteredTasks.length)
						sortableItems.push(<DropLine key="drop-line" />);

					return (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragStart={handleDragStart}
							onDragOver={handleDragOver}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={filteredTasks.map((t) => t.id)}
								strategy={verticalListSortingStrategy}
							>
								{sortableItems}
							</SortableContext>
						</DndContext>
					);
				})()}
			</ScrollArea>
			<QuickAddTask projectId={formProjectId} />
			<ConfirmDeleteDialog
				open={confirmDeleteId !== null}
				onConfirm={async () => {
					if (confirmDeleteId) await deleteTask(getRepository(), confirmDeleteId);
					setConfirmDeleteId(null);
				}}
				onCancel={() => setConfirmDeleteId(null)}
			/>
		</div>
	);
}
