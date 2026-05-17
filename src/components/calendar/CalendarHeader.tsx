import { endOfWeek, format, startOfWeek } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CalendarViewMode = "month" | "week";

interface CalendarHeaderProps {
  readonly currentDate: Date;
  readonly viewMode: CalendarViewMode;
  readonly onViewModeChange: (mode: CalendarViewMode) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onDateChange: (date: Date) => void;
}

export function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onDateChange,
}: CalendarHeaderProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? fr : enUS;
  const [pickerOpen, setPickerOpen] = useState(false);

  const label =
    viewMode === "month"
      ? format(currentDate, "MMMM yyyy", { locale })
      : (() => {
          const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
          return `${format(weekStart, "d MMM", { locale })} – ${format(weekEnd, "d MMM yyyy", { locale })}`;
        })();

  return (
    <div className="glass-header px-5 pt-5 pb-3 shrink-0 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-xl tracking-tight capitalize">{label}</h2>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            aria-label="date picker"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          >
            <CalendarIcon className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={(d) => {
                if (d) {
                  onDateChange(d);
                  setPickerOpen(false);
                }
              }}
              captionLayout="dropdown"
              locale={locale}
              startMonth={new Date(2020, 0)}
              endMonth={new Date(2030, 11)}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg overflow-hidden border border-border/40">
          <button
            type="button"
            onClick={() => onViewModeChange("month")}
            className={cn(
              "px-3 py-1 text-sm transition-colors",
              viewMode === "month"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            )}
          >
            {t("calendar.month")}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("week")}
            className={cn(
              "px-3 py-1 text-sm transition-colors",
              viewMode === "week"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            )}
          >
            {t("calendar.week")}
          </button>
        </div>
        <Button variant="ghost" size="icon" onClick={onPrev} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
