import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import { todayIso } from "@/lib/utils";
import { TaskItem } from "@/components/tasks/TaskItem";
import { TaskForm } from "@/components/tasks/TaskForm";
import { FilterBar } from "@/components/tasks/FilterBar";

function useListTitle(
  selectedProjectId: string | null | undefined,
  projectName?: string
): string {
  if (selectedProjectId === null) return "Inbox";
  if (selectedProjectId === "today") return "Aujourd'hui";
  if (selectedProjectId === undefined) return "Toutes les tâches";
  return projectName ?? "Projet";
}

export function TaskList() {
  const { tasks, loadTasks } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const { selectedProjectId, activeFilters } = useUIStore();

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const title = useListTitle(selectedProjectId, currentProject?.name);

  useEffect(() => {
    const repo = getRepository();
    if (selectedProjectId === "today") {
      loadTasks(repo, { ...activeFilters, dueBefore: todayIso() });
    } else {
      loadTasks(repo, {
        ...activeFilters,
        projectId: selectedProjectId,
      });
    }
  }, [selectedProjectId, activeFilters, loadTasks]);

  // Determine projectId to pre-fill in TaskForm
  const formProjectId =
    selectedProjectId === "today" || selectedProjectId === undefined
      ? null
      : selectedProjectId;

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-base">{title}</h2>
        <TaskForm projectId={formProjectId}>
          <Button size="sm" variant="ghost" className="gap-1">
            <Plus className="h-4 w-4" />
          </Button>
        </TaskForm>
      </div>

      <FilterBar />

      {/* Task list */}
      <ScrollArea className="flex-1">
        {tasks.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">
            Aucune tâche
          </p>
        ) : (
          tasks.map((task) => <TaskItem key={task.id} task={task} />)
        )}
      </ScrollArea>
    </div>
  );
}
