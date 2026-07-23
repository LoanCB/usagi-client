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
import {
	type ReactNode,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useReducer,
	useState,
} from "react";
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
import type { Project, Task } from "@/types";

function DropLine() {
	return (
		<div className="flex items-center mx-3 my-0.5 pointer-events-none">
			<div className="w-2 h-2 rounded-full bg-primary shrink-0" />
			<div className="flex-1 h-0.5 bg-primary" />
		</div>
	);
}

const PRIORITY_WEIGHT: Record<string, number> = {
	blocker: 6,
	highest: 5,
	high: 4,
	medium: 3,
	low: 2,
	lowest: 1,
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

type SortDir = "asc" | "desc" | null;

// The three sort directions are mutually exclusive — activating one always
// clears the other two, and a drag-reorder resets all three — so they live in
// one reducer that enforces that invariant. Likewise the two drag-tracking ids
// are set and cleared together. Each was previously a fan-out of two or three
// setState calls per interaction.
type TaskSortState = { urgency: SortDir; date: SortDir; project: SortDir };

type TaskSortAction =
	| { type: "cycleUrgency" }
	| { type: "cycleDate" }
	| { type: "cycleProject" }
	| { type: "reset" };

const initialTaskSort: TaskSortState = {
	urgency: null,
	date: null,
	project: null,
};

function taskSortReducer(
	state: TaskSortState,
	action: TaskSortAction,
): TaskSortState {
	switch (action.type) {
		case "cycleUrgency":
			if (state.urgency === "desc") return initialTaskSort;
			return {
				urgency: state.urgency === null ? "asc" : "desc",
				date: null,
				project: null,
			};
		case "cycleDate":
			if (state.date === "desc") return initialTaskSort;
			return {
				urgency: null,
				date: state.date === null ? "asc" : "desc",
				project: null,
			};
		case "cycleProject":
			if (state.project === "desc") return initialTaskSort;
			return {
				urgency: null,
				date: null,
				project: state.project === null ? "asc" : "desc",
			};
		case "reset":
			return initialTaskSort;
	}
}

type TaskDragState = { activeId: string | null; overId: string | null };

type TaskDragAction =
	| { type: "start"; id: string }
	| { type: "over"; id: string | null }
	| { type: "end" };

const initialTaskDrag: TaskDragState = { activeId: null, overId: null };

function taskDragReducer(
	state: TaskDragState,
	action: TaskDragAction,
): TaskDragState {
	switch (action.type) {
		case "start":
			return { ...state, activeId: action.id };
		case "over":
			return { ...state, overId: action.id };
		case "end":
			return initialTaskDrag;
	}
}

// The list header: title, today's date, search box, new-task button, and the
// progress stats. Counts are derived from the task list it's given.
function TaskListHeader({
	title,
	showProgress,
	tasks,
	search,
	onSearchChange,
	formProjectId,
}: {
	readonly title: string;
	readonly showProgress: boolean;
	readonly tasks: Task[];
	readonly search: string;
	readonly onSearchChange: (value: string) => void;
	readonly formProjectId: string | null;
}) {
	const { t, i18n } = useTranslation();
	const totalCount = tasks.length;
	const completedCount = tasks.filter((task) => task.completedAt).length;
	const remainingCount = totalCount - completedCount;
	const locale = i18n.language === "fr" ? fr : enUS;
	const dateLabel = format(new Date(), "EEEE d MMMM", { locale });

	return (
		<div className="glass-header px-5 pt-5 pb-3 shrink-0">
			<div className="flex items-center justify-between mb-1">
				<div>
					<h2 className="font-bold text-xl tracking-tight">{title}</h2>
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
						<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<input
							type="text"
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							placeholder={t("task.search")}
							aria-label={t("task.search")}
							className="w-48 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
						/>
						<button
							type="button"
							onClick={() => onSearchChange("")}
							className={`shrink-0 text-muted-foreground hover:text-foreground transition-colors ${search ? "visible" : "invisible"}`}
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
						className="h-full w-full rounded-full bg-primary origin-left transition-transform duration-300"
						style={{
							transform: `scaleX(${
								totalCount > 0 ? completedCount / totalCount : 0
							})`,
						}}
					/>
				</div>
			)}
		</div>
	);
}

// The scrollable task list: applies the search filter, then renders the empty
// state, a flat search-result list, or the drag-and-drop reorderable list with
// its drop indicator.
function TaskListBody({
	search,
	displayedTasks,
	selectedProjectId,
	projects,
	onDeleteRequest,
	sensors,
	activeId,
	overId,
	onDragStart,
	onDragOver,
	onDragEnd,
}: {
	readonly search: string;
	readonly displayedTasks: Task[];
	readonly selectedProjectId: string | null | undefined;
	readonly projects: Project[];
	readonly onDeleteRequest: (id: string) => void;
	readonly sensors: ReturnType<typeof useSensors>;
	readonly activeId: string | null;
	readonly overId: string | null;
	readonly onDragStart: (event: DragStartEvent) => void;
	readonly onDragOver: (event: DragOverEvent) => void;
	readonly onDragEnd: (event: DragEndEvent) => void;
}) {
	const { t } = useTranslation();
	const filteredTasks = search.trim()
		? displayedTasks.filter((task) =>
				task.title.toLowerCase().includes(search.toLowerCase()),
			)
		: displayedTasks;

	if (filteredTasks.length === 0) {
		return (
			<p className="text-center text-muted-foreground text-sm py-12">
				{t("task.noTasks")}
			</p>
		);
	}

	const projectFor = (task: Task) =>
		selectedProjectId === undefined
			? projects.find((p) => p.id === task.projectId)
			: undefined;

	if (search.trim()) {
		return (
			<div>
				{filteredTasks.map((task) => (
					<TaskItem
						key={task.id}
						task={task}
						project={projectFor(task)}
						onDeleteRequest={onDeleteRequest}
					/>
				))}
			</div>
		);
	}

	const ai = filteredTasks.findIndex((t) => t.id === activeId);
	const oi = filteredTasks.findIndex((t) => t.id === overId);
	let insertBefore: number | null = null;
	if (activeId && overId && activeId !== overId && ai !== -1 && oi !== -1) {
		insertBefore = ai < oi ? oi + 1 : oi;
	}

	const sortableItems: ReactNode[] = [];
	filteredTasks.forEach((task, i) => {
		if (insertBefore === i) sortableItems.push(<DropLine key="drop-line" />);
		sortableItems.push(
			<TaskItem
				key={task.id}
				task={task}
				project={projectFor(task)}
				onDeleteRequest={onDeleteRequest}
			/>,
		);
	});
	if (insertBefore === filteredTasks.length)
		sortableItems.push(<DropLine key="drop-line" />);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragEnd={onDragEnd}
		>
			<SortableContext
				items={filteredTasks.map((t) => t.id)}
				strategy={verticalListSortingStrategy}
			>
				{sortableItems}
			</SortableContext>
		</DndContext>
	);
}

export function TaskList() {
	const { t } = useTranslation();
	const { tasks, loadTasks, reorderTasks, deleteTask } = useTaskStore();
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const projects = useProjectStore((s) => s.projects);
	const { selectedProjectId, activeFilters, selectedTaskId, setSelectedTask } =
		useUIStore();

	const currentProject = projects.find((p) => p.id === selectedProjectId);
	const [search, setSearch] = useState("");
	const [drag, dragDispatch] = useReducer(taskDragReducer, initialTaskDrag);
	const { activeId, overId } = drag;
	const [sort, sortDispatch] = useReducer(taskSortReducer, initialTaskSort);
	const { urgency: sortDir, date: sortDateDir, project: sortProjectDir } = sort;

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
		sortDispatch({ type: "reset" });
	}

	const sortByUrgency = useCallback(() => {
		sortDispatch({ type: "cycleUrgency" });
	}, []);

	const sortByDueDate = useCallback(() => {
		sortDispatch({ type: "cycleDate" });
	}, []);

	const sortByProject = useCallback(() => {
		sortDispatch({ type: "cycleProject" });
	}, []);

	// An Effect Event reads the latest props/state without being a reactive dep,
	// so the global keydown listener subscribes once instead of re-subscribing
	// every time the sort callbacks or selection change.
	const onGlobalKeyDown = useEffectEvent((e: KeyboardEvent) => {
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
	});

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			onGlobalKeyDown(e);
		}
		globalThis.addEventListener("keydown", handleKeyDown);
		return () => globalThis.removeEventListener("keydown", handleKeyDown);
	}, []);

	function handleDragStart(event: DragStartEvent) {
		dragDispatch({ type: "start", id: event.active.id as string });
	}

	function handleDragOver(event: DragOverEvent) {
		dragDispatch({ type: "over", id: (event.over?.id as string) ?? null });
	}

	function handleDragEnd(event: DragEndEvent) {
		dragDispatch({ type: "end" });
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
			<TaskListHeader
				title={getTitle()}
				showProgress={
					selectedProjectId === "today" || selectedProjectId === undefined
				}
				tasks={tasks}
				search={search}
				onSearchChange={setSearch}
				formProjectId={formProjectId}
			/>

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
				<TaskListBody
					search={search}
					displayedTasks={displayedTasks}
					selectedProjectId={selectedProjectId}
					projects={projects}
					onDeleteRequest={setConfirmDeleteId}
					sensors={sensors}
					activeId={activeId}
					overId={overId}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragEnd={handleDragEnd}
				/>
			</ScrollArea>
			<QuickAddTask projectId={formProjectId} />
			<ConfirmDeleteDialog
				open={confirmDeleteId !== null}
				onConfirm={async () => {
					if (confirmDeleteId)
						await deleteTask(getRepository(), confirmDeleteId);
					setConfirmDeleteId(null);
				}}
				onCancel={() => setConfirmDeleteId(null)}
			/>
		</div>
	);
}
