import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search } from "lucide-react";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { todayIso } from "@/lib/utils";
import { useShortcutsStore } from "@/store/shortcuts";
import { matchesShortcut } from "@/lib/shortcuts";
import { TaskItem } from "@/components/tasks/TaskItem";
import { TaskForm } from "@/components/tasks/TaskForm";
import { FilterBar } from "@/components/tasks/FilterBar";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import type { Task } from "@/types";

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

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
  const { tasks, loadTasks, reorderTasks } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const { selectedProjectId, activeFilters, selectedTaskId, setSelectedTask } = useUIStore();

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [sortDateDir, setSortDateDir] = useState<"asc" | "desc" | null>(null);
  const [sortProjectDir, setSortProjectDir] = useState<"asc" | "desc" | null>(null);

  function getTitle() {
    if (selectedProjectId === null) return t('nav.inbox');
    if (selectedProjectId === "today") return t('nav.today');
    if (selectedProjectId === undefined) return t('nav.allTasks');
    return currentProject?.name ?? t('task.projectFallback');
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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

  function sortByUrgency() {
    if (sortDir === "desc") { setSortDir(null); loadTasks(getRepository(), { ...activeFilters, projectId: selectedProjectId }); return; }
    const nextDir = sortDir === null ? "asc" : "desc";
    const sorted = [...useTaskStore.getState().tasks].sort(byUrgency);
    if (nextDir === "desc") sorted.reverse();
    reorderTasks(getRepository(), sorted.map((t) => t.id));
    setSortDir(nextDir);
    setSortDateDir(null);
    setSortProjectDir(null);
  }

  function sortByDueDate() {
    if (sortDateDir === "desc") { setSortDateDir(null); loadTasks(getRepository(), { ...activeFilters, projectId: selectedProjectId }); return; }
    const nextDir = sortDateDir === null ? "asc" : "desc";
    const sorted = [...useTaskStore.getState().tasks].sort(byDueDate);
    if (nextDir === "desc") sorted.reverse();
    reorderTasks(getRepository(), sorted.map((t) => t.id));
    setSortDateDir(nextDir);
    setSortDir(null);
    setSortProjectDir(null);
  }

  function sortByProject() {
    if (sortProjectDir === "desc") { setSortProjectDir(null); loadTasks(getRepository(), { ...activeFilters, projectId: selectedProjectId }); return; }
    const nextDir = sortProjectDir === null ? "asc" : "desc";
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const sorted = [...useTaskStore.getState().tasks].sort(byProjectName(projectMap));
    if (nextDir === "desc") sorted.reverse();
    reorderTasks(getRepository(), sorted.map((t) => t.id));
    setSortProjectDir(nextDir);
    setSortDir(null);
    setSortDateDir(null);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape (no modifiers) closes task detail
      if (
        e.key === "Escape" &&
        !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey &&
        selectedTaskId
      ) {
        setSelectedTask(null);
        return;
      }

      const { sortUrgency, sortDueDate, sortProject } = useShortcutsStore.getState();
      if (matchesShortcut(e, sortUrgency)) { e.preventDefault(); sortByUrgency(); return; }
      if (matchesShortcut(e, sortDueDate)) { e.preventDefault(); sortByDueDate(); return; }
      if (matchesShortcut(e, sortProject) && selectedProjectId === undefined) {
        e.preventDefault();
        sortByProject();
      }
    }
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [reorderTasks, selectedTaskId, setSelectedTask, sortByUrgency, sortByDueDate, sortByProject, selectedProjectId]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = useTaskStore.getState().tasks;
    const oldIndex = current.findIndex((t) => t.id === active.id);
    const newIndex = current.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(current, oldIndex, newIndex);
    reorderTasks(getRepository(), reordered.map((t) => t.id));
  }

  const formProjectId =
    selectedProjectId === "today" || selectedProjectId === undefined
      ? null
      : selectedProjectId;


  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Header */}
      {(() => {
        const showProgress = selectedProjectId === "today" || selectedProjectId === undefined;
        const totalCount = tasks.length;
        const completedCount = tasks.filter((t) => t.completedAt).length;
        const remainingCount = totalCount - completedCount;
        const locale = i18n.language === "fr" ? fr : enUS;
        const dateLabel = format(new Date(), "EEEE d MMMM", { locale });

        return (
          <div className="glass-header px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="font-bold text-xl tracking-tight">{getTitle()}</h2>
                {showProgress && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground capitalize">{dateLabel}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold border border-primary/30">
                      {t('taskList.remaining', { count: remainingCount })}
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
                    placeholder={t('task.search')}
                    aria-label={t('task.search')}
                    className="w-28 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                  />
                </div>
                {/* New task */}
                <TaskForm projectId={formProjectId}>
                  <button
                    type="button"
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
                  { label: t('taskList.statPending'), value: remainingCount, className: "text-primary" },
                  { label: t('taskList.statDone'),    value: completedCount,  className: "text-[var(--priority-low)]" },
                  { label: t('taskList.statTotal'),   value: totalCount,      className: "text-muted-foreground" },
                ].map((s) => (
                  <div key={s.label} className="glass-stat flex flex-1 items-center gap-2.5 rounded-xl px-4 py-2.5">
                    <span className={`text-xl font-bold ${s.className}`}>{s.value}</span>
                    <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            {showProgress && (
              <div
                role="progressbar"
                aria-label={t('taskList.progressLabel')}
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalCount}
                aria-valuetext={`${completedCount} / ${totalCount}`}
                className="mt-3 h-1 rounded-full bg-primary/15 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : "0%" }}
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
        onSortByUrgency={sortByUrgency}
        onSortByDueDate={sortByDueDate}
        onSortByProject={selectedProjectId === undefined ? sortByProject : undefined}
        searchQuery={search}
        onSearchChange={setSearch}
      />

      <ScrollArea className="flex-1 min-h-0">
        {(() => {
          const filteredTasks = search.trim()
            ? tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
            : tasks;

          if (filteredTasks.length === 0) {
            return (
              <p className="text-center text-muted-foreground text-sm py-12">
                {t('task.noTasks')}
              </p>
            );
          }

          const items = filteredTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              project={selectedProjectId === undefined ? projects.find((p) => p.id === task.projectId) : undefined}
            />
          ));

          return search.trim() ? (
            <div>{items}</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {items}
              </SortableContext>
            </DndContext>
          );
        })()}
      </ScrollArea>
      <QuickAddTask projectId={formProjectId} />
    </div>
  );
}
