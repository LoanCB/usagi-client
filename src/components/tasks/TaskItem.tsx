import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import type { Task } from "@/types";

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const { completeTask, uncompleteTask } = useTaskStore();
  const { selectedTaskId, setSelectedTask } = useUIStore();
  const isSelected = selectedTaskId === task.id;

  async function handleChecked(checked: boolean) {
    const repo = getRepository();
    if (checked) await completeTask(repo, task.id);
    else await uncompleteTask(repo, task.id);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-border/50 transition-colors",
        "hover:bg-accent/40",
        isSelected && "bg-accent"
      )}
      onClick={() => setSelectedTask(task.id)}
    >
      <Checkbox
        checked={!!task.completedAt}
        onCheckedChange={handleChecked}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      <span
        className={cn(
          "flex-1 text-sm truncate",
          task.completedAt && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </span>
      {task.priority !== "none" && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] }}
          aria-label={`Priority: ${task.priority}`}
        />
      )}
      {task.dueDate && (
        <span
          className={cn(
            "text-xs shrink-0",
            isOverdue(task.dueDate)
              ? "text-[var(--priority-high)]"
              : "text-muted-foreground"
          )}
        >
          {formatDate(task.dueDate)}
        </span>
      )}
      {task.tags.slice(0, 2).map((tag) => (
        <Badge key={tag.id} variant="secondary" className="text-xs shrink-0 h-5">
          {tag.name}
        </Badge>
      ))}
      {task.tags.length > 2 && (
        <Badge variant="secondary" className="text-xs shrink-0 h-5">
          +{task.tags.length - 2}
        </Badge>
      )}
    </div>
  );
}
