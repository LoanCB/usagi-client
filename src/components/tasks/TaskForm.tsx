import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskStore } from "@/store/tasks";
import { getRepository } from "@/store/repository";
import type { Priority } from "@/types";

interface TaskFormProps {
  readonly children: ReactElement;
  readonly projectId?: string | null;
}

export function TaskForm({ children, projectId = null }: TaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [dueDate, setDueDate] = useState("");
  const createTask = useTaskStore((s) => s.createTask);
  const { t } = useTranslation();

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask(getRepository(), {
      title: title.trim(),
      projectId: projectId ?? null,
      priority,
      dueDate: dueDate || null,
    });
    setTitle("");
    setPriority("none");
    setDueDate("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => setOpen(isOpen)}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('task.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            placeholder={t('task.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as Priority)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={t('priority.label')}>
                  {(v: string) => ({
                    none: t('priority.none'),
                    low: t('priority.low'),
                    medium: t('priority.medium'),
                    high: t('priority.high'),
                  }[v])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('priority.none')}</SelectItem>
                <SelectItem value="low">{t('priority.low')}</SelectItem>
                <SelectItem value="medium">{t('priority.medium')}</SelectItem>
                <SelectItem value="high">{t('priority.high')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
