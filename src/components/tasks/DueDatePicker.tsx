import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { CalendarIcon, X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface DueDatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
}

export function DueDatePicker({ value, onChange }: DueDatePickerProps) {
  const { t } = useTranslation();
  const selected = value ? new Date(value) : undefined;

  function handleSelect(date: Date | undefined) {
    onChange(date ? date.toISOString().split("T")[0] : null);
  }

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 h-7 px-2")}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="text-xs">
            {value ? formatDate(value) : t('dueDate.label')}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onChange(null)}
          aria-label={t('dueDate.remove')}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
