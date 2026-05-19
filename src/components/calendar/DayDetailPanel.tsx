import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project, Task } from "@/types";

type DayState = "past" | "today" | "future";

interface DayDetailPanelProps {
  readonly day: string;
  readonly entry: { due: Task[]; completed: Task[] } | undefined;
  readonly width: number;
  readonly onClose: () => void;
  readonly onTaskClick: (task: Task) => void;
  readonly focusTrigger?: number;
  readonly projectFilter?: string | null;
  readonly projects: Project[];
}

function SectionDivider({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-2 pb-0.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/25" />
    </div>
  );
}

function DueTaskButton({
  task,
  dayState,
  overdueLabel,
  onTaskClick,
}: {
  readonly task: Task;
  readonly dayState: DayState;
  readonly overdueLabel: string;
  readonly onTaskClick: (task: Task) => void;
}) {
  if (dayState === "past") {
    return (
      <Tooltip>
        <TooltipTrigger
          type="button"
          onClick={() => onTaskClick(task)}
          className="text-xs text-left px-2 py-1.5 rounded bg-red-500/15 text-foreground hover:bg-red-500/25 transition-colors w-full flex items-center justify-between gap-2 border-l-[3px] border-red-500"
        >
          <span className="truncate">{task.title}</span>
          <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded shrink-0 font-medium">
            {overdueLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">{task.title}</TooltipContent>
      </Tooltip>
    );
  }
  if (dayState === "today") {
    return (
      <Tooltip>
        <TooltipTrigger
          type="button"
          onClick={() => onTaskClick(task)}
          className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/15 text-foreground hover:bg-orange-500/25 transition-colors w-full flex items-center gap-2 border-l-[3px] border-orange-500"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
          <span className="truncate">{task.title}</span>
        </TooltipTrigger>
        <TooltipContent side="left">{task.title}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={() => onTaskClick(task)}
        className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/10 text-foreground hover:bg-orange-500/20 transition-colors w-full truncate border-l-[3px] border-orange-500"
      >
        {task.title}
      </TooltipTrigger>
      <TooltipContent side="left">{task.title}</TooltipContent>
    </Tooltip>
  );
}

function CompletedTaskButton({
  task,
  onTaskClick,
}: {
  readonly task: Task;
  readonly onTaskClick: (task: Task) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={() => onTaskClick(task)}
        className="text-xs text-left px-2 py-1.5 rounded text-muted-foreground/50 hover:bg-muted/10 transition-colors w-full flex items-center gap-2"
      >
        <div className="w-3.5 h-3.5 rounded-full bg-muted/20 flex items-center justify-center shrink-0">
          <Check className="w-2 h-2 text-muted-foreground/50" />
        </div>
        <span className="truncate">{task.title}</span>
      </TooltipTrigger>
      <TooltipContent side="left">{task.title}</TooltipContent>
    </Tooltip>
  );
}

export function DayDetailPanel({
  day,
  entry,
  width,
  onClose,
  onTaskClick,
  focusTrigger,
  projectFilter,
  projects,
}: DayDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? fr : enUS;

  const date = new Date(`${day}T00:00:00`);
  const today = format(new Date(), "yyyy-MM-dd");
  let dayState: DayState = "future";
  if (day < today) dayState = "past";
  else if (day === today) dayState = "today";

  const due = entry?.due ?? [];
  const completed = entry?.completed ?? [];
  const hasAny = due.length > 0 || completed.length > 0;

  const overdueLabel = t("calendar.overdue");

  const distinctProjectIds = new Set([
    ...due.map((tk) => tk.projectId),
    ...completed.map((tk) => tk.projectId),
  ]);
  const isMultiProject = distinctProjectIds.size > 1;

  const projectGroups: {
    projectId: string | null;
    due: Task[];
    completed: Task[];
  }[] = isMultiProject
    ? (() => {
        const map = new Map<
          string | null,
          { due: Task[]; completed: Task[] }
        >();
        for (const task of due) {
          const pid = task.projectId;
          let group = map.get(pid);
          if (!group) {
            group = { due: [], completed: [] };
            map.set(pid, group);
          }
          group.due.push(task);
        }
        for (const task of completed) {
          const pid = task.projectId;
          let group = map.get(pid);
          if (!group) {
            group = { due: [], completed: [] };
            map.set(pid, group);
          }
          group.completed.push(task);
        }
        const ids = [...map.keys()];
        ids.sort((a, b) => {
          if (a === null) return 1;
          if (b === null) return -1;
          const pa = projects.find((p) => p.id === a)?.sortOrder ?? 0;
          const pb = projects.find((p) => p.id === b)?.sortOrder ?? 0;
          return pa - pb;
        });
        return ids.map((pid) => ({
          projectId: pid,
          ...(map.get(pid) ?? { due: [], completed: [] }),
        }));
      })()
    : [];

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

      <div className="flex flex-col flex-1 overflow-y-auto px-3 py-2 gap-1.5">
        {!hasAny && (
          <p className="text-xs text-muted-foreground/60 text-center py-4">
            {t("calendar.noTasks")}
          </p>
        )}

        {isMultiProject ? (
          projectGroups.map((group, i) => {
            const project = projects.find((p) => p.id === group.projectId);
            const isInbox = group.projectId === null;
            return (
              <div
                key={group.projectId ?? "inbox"}
                className={i > 0 ? "mt-2" : undefined}
              >
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  {!isInbox && (
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: project?.color ?? "#888" }}
                    />
                  )}
                  <span className="text-xs text-muted-foreground font-medium">
                    {isInbox
                      ? t("nav.inbox")
                      : (project?.name ?? group.projectId)}
                  </span>
                </div>
                {group.due.length > 0 && (
                  <>
                    <SectionDivider label={t("calendar.dueSection")} />
                    {group.due.map((task) => (
                      <DueTaskButton
                        key={task.id}
                        task={task}
                        dayState={dayState}
                        overdueLabel={overdueLabel}
                        onTaskClick={onTaskClick}
                      />
                    ))}
                  </>
                )}
                {group.completed.length > 0 && (
                  <>
                    <SectionDivider label={t("calendar.completedSection")} />
                    {group.completed.map((task) => (
                      <CompletedTaskButton
                        key={task.id}
                        task={task}
                        onTaskClick={onTaskClick}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })
        ) : (
          <>
            {due.length > 0 && (
              <>
                <SectionDivider label={t("calendar.dueSection")} />
                {due.map((task) => (
                  <DueTaskButton
                    key={task.id}
                    task={task}
                    dayState={dayState}
                    overdueLabel={overdueLabel}
                    onTaskClick={onTaskClick}
                  />
                ))}
              </>
            )}
            {completed.length > 0 && (
              <>
                <SectionDivider label={t("calendar.completedSection")} />
                {completed.map((task) => (
                  <CompletedTaskButton
                    key={task.id}
                    task={task}
                    onTaskClick={onTaskClick}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border/40 py-1">
        <QuickAddTask
          projectId={projectFilter ?? null}
          dueDate={day}
          focusTrigger={focusTrigger}
        />
      </div>
    </div>
  );
}
