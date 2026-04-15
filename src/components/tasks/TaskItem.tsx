import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { GripVertical, TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { getRepository } from "@/store/repository";
import type { Task } from "@/types";

const PRIORITY_BORDER_COLORS: Record<string, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
  none: "transparent",
};

interface TaskItemProps {
  readonly task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const { completeTask, uncompleteTask } = useTaskStore();
  const { selectedTaskId, setSelectedTask } = useUIStore();
  const { t, i18n } = useTranslation();
  const isSelected = selectedTaskId === task.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    borderLeftColor: PRIORITY_BORDER_COLORS[task.priority],
  };

  async function handleChecked(checked: boolean) {
    const repo = getRepository();
    if (checked) await completeTask(repo, task.id);
    else await uncompleteTask(repo, task.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 pl-3 pr-4 py-2.5 border-b border-l-[3px] border-border/50 transition-colors",
        "hover:bg-accent/40",
        isSelected && "bg-accent"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
        aria-label={t('task.reorder')}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Checkbox
        checked={!!task.completedAt}
        onCheckedChange={handleChecked}
        className="shrink-0"
      />

      {/* Clickable title area */}
      <button
        className={cn(
          "flex-1 text-sm truncate text-left",
          task.completedAt && "line-through text-muted-foreground"
        )}
        onClick={() => setSelectedTask(task.id)}
      >
        {task.title}
      </button>

      {task.dueDate && (
        <span className="flex items-center gap-1 shrink-0">
          {isOverdue(task.dueDate) && (
            <TriangleAlert className="h-3.5 w-3.5 text-[var(--priority-high)]" />
          )}
          <span className={cn(
            "text-xs",
            isOverdue(task.dueDate) ? "text-[var(--priority-high)]" : "text-muted-foreground"
          )}>
            {formatDate(task.dueDate, i18n.language)}
          </span>
        </span>
      )}
      {task.tags.slice(0, 2).map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="text-xs shrink-0 h-5"
          style={tag.color ? {
            backgroundColor: `${tag.color}28`,
            color: tag.color,
            borderColor: `${tag.color}50`,
          } : undefined}
        >
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
