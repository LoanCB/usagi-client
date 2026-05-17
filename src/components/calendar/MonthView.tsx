import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
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

interface MonthViewProps {
  readonly currentDate: Date;
  readonly grouped: Map<string, { due: Task[]; completed: Task[] }>;
  readonly selectedDay: string | null;
  readonly onDayClick: (date: string) => void;
  readonly onTaskClick: (task: Task) => void;
  readonly onCreateForDay: (date: string) => void;
}

export function MonthView({
  currentDate,
  grouped,
  selectedDay,
  onDayClick,
  onTaskClick,
  onCreateForDay,
}: MonthViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? fr : enUS;

  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calStart);
    d.setDate(d.getDate() + i);
    return format(d, "EEEEEE", { locale });
  });

  return (
    <div className="flex flex-col flex-1 overflow-auto px-4 pb-4">
      <div className="grid grid-cols-7 gap-px mb-1 sticky top-0 bg-background/80 backdrop-blur-sm pt-2 pb-1">
        {dayHeaders.map((label) => (
          <div
            key={label}
            className="text-center text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider py-1"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px flex-1">
        {days.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const entry = grouped.get(iso);
          const due = entry?.due ?? [];
          const completed = entry?.completed ?? [];
          const today = isToday(day);
          const sameMonth = isSameMonth(day, currentDate);
          const selected = selectedDay === iso;

          return (
            <ContextMenu key={iso}>
              <ContextMenuTrigger
                onClick={() => onDayClick(iso)}
                className={cn(
                  "min-h-[90px] border border-border/20 p-1.5 cursor-pointer transition-colors hover:bg-foreground/5",
                  !sameMonth && "opacity-40",
                  today && "bg-primary/10 border-primary/30",
                  selected && "ring-2 ring-inset ring-primary",
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium mb-1.5 w-6 h-6 flex items-center justify-center rounded-full",
                    today && "bg-primary text-primary-foreground",
                    !today && "text-foreground/70",
                  )}
                >
                  {format(day, "d")}
                </div>
                <div className="flex flex-wrap gap-1">
                  {due.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      title={task.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskClick(task);
                      }}
                      className="w-2.5 h-2.5 rounded-full bg-orange-400/80 hover:scale-125 transition-transform shrink-0"
                    />
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
                      className="w-2.5 h-2.5 rounded-full bg-green-400/80 hover:scale-125 transition-transform shrink-0"
                    />
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
    </div>
  );
}
