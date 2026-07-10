import { addMonths, addWeeks, subMonths, subWeeks } from "date-fns";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizable } from "@/hooks/useResizable";
import { groupTasksByDate } from "@/lib/calendarUtils";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";
import { CalendarHeader, type CalendarViewMode } from "./CalendarHeader";
import { DayDetailPanel } from "./DayDetailPanel";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

// The calendar's navigation state moves as one unit: changing the period or the
// view mode always clears the selected day, and opening a day also bumps the
// quick-add focus trigger. Grouping these into a reducer keeps those linked
// updates in a single render instead of fanning out into several.
type CalendarNavState = {
	viewMode: CalendarViewMode;
	currentDate: Date;
	selectedDay: string | null;
	quickAddFocusTrigger: number;
};

type CalendarNavAction =
	| { type: "prev" }
	| { type: "next" }
	| { type: "setViewMode"; mode: CalendarViewMode }
	| { type: "setDate"; date: Date }
	| { type: "toggleDay"; date: string }
	| { type: "openDay"; date: string }
	| { type: "closeDay" };

function calendarNavReducer(
	state: CalendarNavState,
	action: CalendarNavAction,
): CalendarNavState {
	switch (action.type) {
		case "prev":
			return {
				...state,
				currentDate:
					state.viewMode === "month"
						? subMonths(state.currentDate, 1)
						: subWeeks(state.currentDate, 1),
				selectedDay: null,
			};
		case "next":
			return {
				...state,
				currentDate:
					state.viewMode === "month"
						? addMonths(state.currentDate, 1)
						: addWeeks(state.currentDate, 1),
				selectedDay: null,
			};
		case "setViewMode":
			return { ...state, viewMode: action.mode, selectedDay: null };
		case "setDate":
			return { ...state, currentDate: action.date, selectedDay: null };
		case "toggleDay":
			return {
				...state,
				selectedDay: state.selectedDay === action.date ? null : action.date,
			};
		case "openDay":
			return {
				...state,
				selectedDay: action.date,
				quickAddFocusTrigger: state.quickAddFocusTrigger + 1,
			};
		case "closeDay":
			return { ...state, selectedDay: null };
	}
}

export function CalendarView() {
	const [nav, dispatch] = useReducer(calendarNavReducer, undefined, () => ({
		viewMode: "month" as CalendarViewMode,
		currentDate: new Date(),
		selectedDay: null,
		quickAddFocusTrigger: 0,
	}));
	const { viewMode, currentDate, selectedDay, quickAddFocusTrigger } = nav;

	const { loadTasks } = useTaskStore();
	const tasks = useTaskStore((s) => s.tasks);
	const { navigateToTask } = useUIStore();
	const projects = useProjectStore((s) => s.projects);

	const [calendarProjectFilter, setCalendarProjectFilter] = useState<
		string[] | null
	>(null);

	const [calendarStatusFilter, setCalendarStatusFilter] = useState<
		"completed" | "overdue" | "pending" | undefined
	>(undefined);

	const { t } = useTranslation();
	const { width, isDragging, onMouseDown, onDoubleClick, onKeyDown } =
		useResizable({
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
			calendarProjectFilter === null || calendarProjectFilter.length === 0
				? tasks
				: tasks.filter((t) =>
						calendarProjectFilter.some((id) =>
							id === INBOX_PROJECT_ID
								? t.projectId === null
								: t.projectId === id,
						),
					);

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
		dispatch({ type: "prev" });
	}

	function handleNext() {
		dispatch({ type: "next" });
	}

	function handleDayClick(date: string) {
		dispatch({ type: "toggleDay", date });
	}

	function handleOpenDay(date: string) {
		dispatch({ type: "openDay", date });
	}

	function handleTaskClick(task: Task) {
		navigateToTask(task.projectId, task.id);
	}

	function handleDateChange(date: Date) {
		dispatch({ type: "setDate", date });
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
				dispatch({ type: "closeDay" });
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
				onViewModeChange={(mode) => dispatch({ type: "setViewMode", mode })}
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
							onKeyDown={onKeyDown}
							isDragging={isDragging}
							ariaLabel={t("common.resizePanel")}
						/>
						<DayDetailPanel
							day={selectedDay}
							entry={grouped.get(selectedDay)}
							width={width}
							onClose={() => dispatch({ type: "closeDay" })}
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
