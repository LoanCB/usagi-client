import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
} from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

interface WeekViewProps {
  readonly currentDate: Date;
  readonly grouped: Map<string, { due: Task[]; completed: Task[] }>;
  readonly selectedDay: string | null;
  readonly onDayClick: (date: string) => void;
  readonly onTaskClick: (task: Task) => void;
  readonly onCreateForDay: (date: string) => void;
}

export function WeekView({
  currentDate,
  grouped,
  selectedDay,
  onDayClick,
  onTaskClick,
  onCreateForDay,
}: WeekViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? fr : enUS;

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div className="flex flex-1 overflow-auto px-4 pb-4 gap-px">
      {days.map((day) => {
        const iso = format(day, "yyyy-MM-dd");
        const entry = grouped.get(iso);
        const due = entry?.due ?? [];
        const completed = entry?.completed ?? [];
        const today = isToday(day);
        const selected = selectedDay === iso;

        return (
          <ContextMenu key={iso}>
            <ContextMenuTrigger
              onClick={() => onDayClick(iso)}
              className={cn(
                "flex flex-col flex-1 min-w-0 border border-border/20 cursor-pointer transition-colors hover:bg-foreground/5",
                today && "bg-primary/10 border-primary/30",
                selected && "ring-2 ring-inset ring-primary",
              )}
            >
              <div
                className={cn(
                  "px-2 py-2 text-center border-b border-border/20 shrink-0",
                  today && "bg-primary/20",
                )}
              >
                <div className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  {format(day, "EEE", { locale })}
                </div>
                <div
                  className={cn(
                    "text-sm font-bold mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full",
                    today && "bg-primary text-primary-foreground",
                    !today && "text-foreground/80",
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>

              <div className="flex flex-col gap-0.5 p-1 flex-1 overflow-y-auto">
                {due.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    title={task.title}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(task);
                    }}
                    className="text-xs truncate px-1.5 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 text-left w-full transition-colors"
                  >
                    {task.title}
                  </button>
                ))}
                {completed.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    title={task.title}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(task);
                    }}
                    className="text-xs truncate px-1.5 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 text-left w-full transition-colors line-through opacity-70"
                  >
                    {task.title}
                  </button>
                ))}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onCreateForDay(iso)}>
                {t("calendar.newTask")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
