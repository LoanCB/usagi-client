import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTaskStore } from "@/store/tasks";
import { getRepository } from "@/store/repository";

interface QuickAddTaskProps {
  projectId: string | null | undefined;
}

export function QuickAddTask({ projectId }: QuickAddTaskProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useTaskStore((s) => s.createTask);
  const { t } = useTranslation();

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        await createTask(getRepository(), {
          title: trimmed,
          projectId: projectId ?? null,
        });
        setTitle("");
        inputRef.current?.focus();
      } catch (err) {
        console.error("Failed to create task", err);
      }
    } else if (e.key === "Escape") {
      setTitle("");
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-background sticky bottom-0">
      <div className="w-3.5 h-3.5 rounded-sm border border-dashed border-muted-foreground/40 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("task.titlePlaceholder")}
        aria-label={t("task.titlePlaceholder")}
        className="flex-1 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 outline-none"
      />
    </div>
  );
}
