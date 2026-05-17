import { addMonths, addWeeks, subMonths, subWeeks } from "date-fns";
import { useMemo, useState, useEffect } from "react";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { groupTasksByDate } from "@/lib/calendarUtils";
import { useResizable } from "@/hooks/useResizable";
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
  const { setSelectedTask } = useUIStore();

  const [calendarProjectFilter, setCalendarProjectFilter] = useState<
    string | null | undefined
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

  const filteredTasks = useMemo(
    () =>
      calendarProjectFilter === undefined
        ? tasks
        : tasks.filter((t) => t.projectId === calendarProjectFilter),
    [tasks, calendarProjectFilter],
  );

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
    setSelectedTask(task.id);
  }

  function handleDateChange(date: Date) {
    setCurrentDate(date);
    setSelectedDay(null);
  }

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
            />
          </>
        )}
      </div>
    </div>
  );
}
