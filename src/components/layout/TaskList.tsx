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
import { Plus } from "lucide-react";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { todayIso, hasModifier } from "@/lib/utils";
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
  const { t } = useTranslation();
  const { tasks, loadTasks, reorderTasks } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const { selectedProjectId, activeFilters, selectedTaskId, setSelectedTask } = useUIStore();

  const currentProject = projects.find((p) => p.id === selectedProjectId);
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
      if (e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!hasModifier(e)) {
        if (e.key === "Escape" && selectedTaskId) { setSelectedTask(null); }
        return;
      }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); sortByUrgency(); return; }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); sortByDueDate(); return; }
      if ((e.key === "p" || e.key === "P") && selectedProjectId === undefined) { e.preventDefault(); sortByProject(); }
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
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-base">{getTitle()}</h2>
        <TaskForm projectId={formProjectId}>
          <Button size="sm" variant="ghost" className="gap-1">
            <Plus className="h-4 w-4" />
          </Button>
        </TaskForm>
      </div>

      <FilterBar
        sortDir={sortDir}
        sortDateDir={sortDateDir}
        sortProjectDir={sortProjectDir}
        onSortByUrgency={sortByUrgency}
        onSortByDueDate={sortByDueDate}
        onSortByProject={selectedProjectId === undefined ? sortByProject : undefined}
      />

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
                <TaskItem
                  key={task.id}
                  task={task}
                  project={selectedProjectId === undefined ? projects.find((p) => p.id === task.projectId) : undefined}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}
