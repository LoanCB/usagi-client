import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";
import type { Priority } from "@/types";

export function FilterBar() {
  const { t } = useTranslation();
  const { activeFilters, setFilters } = useUIStore();

  const PRIORITY_LABELS: Record<Priority, string> = {
    none: t('priority.none'),
    low: t('priority.low'),
    medium: t('priority.medium'),
    high: t('priority.high'),
  };

  const hasFilters =
    !!activeFilters.priority ||
    (activeFilters.tagIds?.length ?? 0) > 0 ||
    !!activeFilters.completed;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 flex-wrap">
      {/* Priority filter */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-7 gap-1 text-xs"
          )}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {activeFilters.priority
            ? PRIORITY_LABELS[activeFilters.priority]
            : t('filter.priority')}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(["high", "medium", "low", "none"] as Priority[]).map((p) => (
            <DropdownMenuItem key={p} onClick={() => setFilters({ priority: p })}>
              {PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Show completed toggle */}
      <Button
        variant={activeFilters.completed ? "secondary" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() =>
          setFilters({
            completed: activeFilters.completed ? undefined : true,
          })
        }
      >
        {t('filter.completed')}
      </Button>

      {/* Active filter chips */}
      {activeFilters.priority && (
        <Badge variant="secondary" className="gap-1 h-6 text-xs">
          {PRIORITY_LABELS[activeFilters.priority]}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => setFilters({ priority: undefined })}
          />
        </Badge>
      )}

      {/* Reset all */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground ml-auto"
          onClick={() =>
            setFilters({ priority: undefined, tagIds: [], completed: undefined })
          }
        >
          {t('filter.reset')}
        </Button>
      )}
    </div>
  );
}
