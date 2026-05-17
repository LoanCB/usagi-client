import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import type { Task } from "@/types";

interface DayDetailPanelProps {
  readonly day: string;
  readonly entry: { due: Task[]; completed: Task[] } | undefined;
  readonly width: number;
  readonly onClose: () => void;
  readonly onTaskClick: (task: Task) => void;
  readonly focusTrigger?: number;
}

export function DayDetailPanel({
  day,
  entry,
  width,
  onClose,
  onTaskClick,
  focusTrigger,
}: DayDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? fr : enUS;

  const date = new Date(`${day}T00:00:00`);
  const due = entry?.due ?? [];
  const completed = entry?.completed ?? [];
  const hasAny = due.length > 0 || completed.length > 0;

  return (
    <div
      className="flex flex-col shrink-0 border-l border-border/40 overflow-hidden"
      style={{ width }}
    >
      <div className="glass-header px-4 py-3 shrink-0 flex items-center justify-between">
        <span className="text-sm font-semibold capitalize">
          {format(date, "EEEE d MMMM yyyy", { locale })}
        </span>
        <button
          type="button"
          aria-label={t("calendar.closeDay")}
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto px-3 py-2 gap-1">
        {!hasAny && (
          <p className="text-xs text-muted-foreground/60 text-center py-4">
            {t("calendar.noTasks")}
          </p>
        )}
        {due.map((task) => (
          <button
            key={task.id}
            type="button"
            title={task.title}
            onClick={() => onTaskClick(task)}
            className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors w-full"
          >
            {task.title}
          </button>
        ))}
        {completed.map((task) => (
          <button
            key={task.id}
            type="button"
            title={task.title}
            onClick={() => onTaskClick(task)}
            className="text-xs text-left px-2 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors w-full line-through opacity-70"
          >
            {task.title}
          </button>
        ))}
      </div>

      <div className="shrink-0 border-t border-border/40 py-1">
        <QuickAddTask projectId={null} dueDate={day} focusTrigger={focusTrigger} />
      </div>
    </div>
  );
}
