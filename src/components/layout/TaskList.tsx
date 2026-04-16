import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Button } from "@/components/ui/button";
import { Plus, ArrowDownUp, CalendarArrowUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { todayIso } from "@/lib/utils";
import { TaskItem } from "@/components/tasks/TaskItem";
import { TaskForm } from "@/components/tasks/TaskForm";
import { FilterBar } from "@/components/tasks/FilterBar";
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

export function TaskList() {
  const { t } = useTranslation();
  const { tasks, loadTasks, reorderTasks } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const { selectedProjectId, activeFilters, selectedTaskId, setSelectedTask } = useUIStore();

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [sortDateDir, setSortDateDir] = useState<"asc" | "desc" | null>(null);

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
    const nextDir = sortDir === "asc" ? "desc" : "asc";
    const sorted = [...useTaskStore.getState().tasks].sort(byUrgency);
    if (nextDir === "desc") sorted.reverse();
    reorderTasks(getRepository(), sorted.map((t) => t.id));
    setSortDir(nextDir);
    setSortDateDir(null);
  }

  function sortByDueDate() {
    const nextDir = sortDateDir === "asc" ? "desc" : "asc";
    const sorted = [...useTaskStore.getState().tasks].sort(byDueDate);
    if (nextDir === "desc") sorted.reverse();
    reorderTasks(getRepository(), sorted.map((t) => t.id));
    setSortDateDir(nextDir);
    setSortDir(null);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "s" || e.key === "S") { sortByUrgency(); return; }
      if (e.key === "Escape" && selectedTaskId) { setSelectedTask(null); }
    }
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [reorderTasks, selectedTaskId, setSelectedTask]);

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
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-base">{getTitle()}</h2>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className={sortDir === null ? "text-muted-foreground" : "text-foreground"}
                onClick={sortByUrgency}
              />
            }>
              <ArrowDownUp className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              {t('sort.urgency')} · {sortDir === "asc" ? "↑" : "↓"} <kbd className="ml-1 text-xs opacity-60">S</kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className={sortDateDir === null ? "text-muted-foreground" : "text-foreground"}
                onClick={sortByDueDate}
              />
            }>
              <CalendarArrowUp className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              {t('sort.dueDate')} · {sortDateDir === "asc" ? "↑" : "↓"}
            </TooltipContent>
          </Tooltip>
          <TaskForm projectId={formProjectId}>
            <Button size="sm" variant="ghost" className="gap-1">
              <Plus className="h-4 w-4" />
            </Button>
          </TaskForm>
        </div>
      </div>

      <FilterBar />

      <ScrollArea className="flex-1">
        {tasks.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">
            {t('task.noTasks')}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}
