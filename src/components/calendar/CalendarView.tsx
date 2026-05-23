import { addMonths, addWeeks, subMonths, subWeeks } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizable } from "@/hooks/useResizable";
import { groupTasksByDate } from "@/lib/calendarUtils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";
import { CalendarHeader, type CalendarViewMode } from "./CalendarHeader";
import { DayDetailPanel } from "./DayDetailPanel";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

export function CalendarView() {
	const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
	const [currentDate, setCurrentDate] = useState(() => new Date());
	const [selectedDay, setSelectedDay] = useState<string | null>(null);
	const [quickAddFocusTrigger, setQuickAddFocusTrigger] = useState(0);

	const { loadTasks } = useTaskStore();
	const tasks = useTaskStore((s) => s.tasks);
	const { navigateToTask } = useUIStore();
	const projects = useProjectStore((s) => s.projects);

	const [calendarProjectFilter, setCalendarProjectFilter] = useState<
		string | null | undefined
	>(undefined);

	const [calendarStatusFilter, setCalendarStatusFilter] = useState<
		"completed" | "overdue" | "pending" | undefined
	>(undefined);

	const { width, isDragging, onMouseDown, onDoubleClick } = useResizable({
		storageKey: "calendar-day-panel-width",
		defaultWidth: 280,
		minWidth: 200,
		maxWidth: 480,
	});

	useEffect(() => {
		loadTasks(getRepository(), { allTasks: true });
	}, [loadTasks]);

	const filteredTasks = useMemo(() => {
		let result =
			calendarProjectFilter === undefined
				? tasks
				: tasks.filter((t) => t.projectId === calendarProjectFilter);

		if (calendarStatusFilter !== undefined) {
			const today = new Date().toISOString().slice(0, 10);
			result = result.filter((t) => {
				if (calendarStatusFilter === "completed") return t.completedAt !== null;
				if (calendarStatusFilter === "overdue")
					return (
						t.completedAt === null && t.dueDate !== null && t.dueDate < today
					);
				return (
					t.completedAt === null && (t.dueDate === null || t.dueDate >= today)
				);
			});
		}
		return result;
	}, [tasks, calendarProjectFilter, calendarStatusFilter]);

	const grouped = useMemo(
		() => groupTasksByDate(filteredTasks),
		[filteredTasks],
	);

	function handlePrev() {
		setCurrentDate((d) =>
			viewMode === "month" ? subMonths(d, 1) : subWeeks(d, 1),
		);
		setSelectedDay(null);
	}

	function handleNext() {
		setCurrentDate((d) =>
			viewMode === "month" ? addMonths(d, 1) : addWeeks(d, 1),
		);
		setSelectedDay(null);
	}

	function handleDayClick(date: string) {
		setSelectedDay((prev) => (prev === date ? null : date));
	}

	function handleOpenDay(date: string) {
		setSelectedDay(date);
		setQuickAddFocusTrigger((n) => n + 1);
	}

	function handleTaskClick(task: Task) {
		navigateToTask(task.projectId, task.id);
	}

	function handleDateChange(date: Date) {
		setCurrentDate(date);
		setSelectedDay(null);
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (
				e.key === "Escape" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey &&
				selectedDay
			) {
				setSelectedDay(null);
			}
		}
		globalThis.addEventListener("keydown", handleKeyDown);
		return () => globalThis.removeEventListener("keydown", handleKeyDown);
	}, [selectedDay]);

	return (
		<div className="flex flex-col flex-1 min-w-0 overflow-hidden">
			<CalendarHeader
				currentDate={currentDate}
				viewMode={viewMode}
				onViewModeChange={(mode) => {
					setViewMode(mode);
					setSelectedDay(null);
				}}
				onPrev={handlePrev}
				onNext={handleNext}
				onDateChange={handleDateChange}
				projectFilter={calendarProjectFilter}
				onProjectFilterChange={setCalendarProjectFilter}
				statusFilter={calendarStatusFilter}
				onStatusFilterChange={setCalendarStatusFilter}
			/>

			<div className="flex flex-1 overflow-hidden min-w-0">
				<div className="flex flex-col flex-1 overflow-hidden min-w-0">
					{viewMode === "month" ? (
						<MonthView
							currentDate={currentDate}
							grouped={grouped}
							selectedDay={selectedDay}
							onDayClick={handleDayClick}
							onTaskClick={handleTaskClick}
							onCreateForDay={handleOpenDay}
						/>
					) : (
						<WeekView
							currentDate={currentDate}
							grouped={grouped}
							selectedDay={selectedDay}
							onDayClick={handleDayClick}
							onTaskClick={handleTaskClick}
							onCreateForDay={handleOpenDay}
						/>
					)}
				</div>
				{selectedDay && (
					<>
						<ResizeHandle
							onMouseDown={onMouseDown}
							onDoubleClick={onDoubleClick}
							isDragging={isDragging}
						/>
						<DayDetailPanel
							day={selectedDay}
							entry={grouped.get(selectedDay)}
							width={width}
							onClose={() => setSelectedDay(null)}
							onTaskClick={handleTaskClick}
							focusTrigger={quickAddFocusTrigger}
							projectFilter={calendarProjectFilter}
							projects={projects}
						/>
					</>
				)}
			</div>
		</div>
	);
}
