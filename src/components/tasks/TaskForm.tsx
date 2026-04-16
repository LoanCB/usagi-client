import React, { useState, type ReactElement } from "react";
import { X, CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fr } from "react-day-picker/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskStore } from "@/store/tasks";
import { getRepository } from "@/store/repository";
import { TagSelector } from "@/components/tasks/TagSelector";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { cn, formatDate } from "@/lib/utils";
import type { Priority } from "@/types";

interface TaskFormProps {
  readonly children: ReactElement;
  readonly projectId?: string | null;
}

export function TaskForm({ children, projectId = null }: TaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const createTask = useTaskStore((s) => s.createTask);
  const { t, i18n } = useTranslation();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask(getRepository(), {
      title: title.trim(),
      description: description || null,
      projectId: projectId ?? null,
      priority,
      dueDate: dueDate || null,
      tagIds,
    });
    setTitle("");
    setDescription("");
    setPriority("none");
    setDueDate(null);
    setShowDatePicker(false);
    setCalendarOpen(false);
    setTagIds([]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => setOpen(isOpen)}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-lg">
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
          <div className="h-48 overflow-hidden rounded-md border border-input flex flex-col">
            <RichTextEditor
              value={description}
              onChange={setDescription}
              onBlur={() => {}}
              placeholder={t('task.descriptionPlaceholder')}
            />
          </div>
          <TagSelector selectedTagIds={tagIds} onChange={setTagIds} />
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
            {showDatePicker ? (
              <div className="flex flex-1 gap-1 items-center">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger
                    className={cn(buttonVariants({ variant: "ghost" }), "gap-2 justify-start flex-1")}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span>{dueDate ? formatDate(dueDate, i18n.language) : t('dueDate.label')}</span>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate ? new Date(dueDate) : undefined}
                      onSelect={(date) => {
                        setDueDate(date ? date.toISOString().split("T")[0] : null);
                        setCalendarOpen(false);
                      }}
                      locale={i18n.language === "fr" ? fr : undefined}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => { setDueDate(null); setShowDatePicker(false); }}
                  aria-label={t('dueDate.remove')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="flex-1 justify-start text-muted-foreground"
                onClick={() => { setShowDatePicker(true); setCalendarOpen(true); }}
              >
                + {t('task.addDate')}
              </Button>
            )}
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
