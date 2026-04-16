import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SlidersHorizontal, Tag, Check, Flame, CalendarArrowUp, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";
import { useTagStore } from "@/store/tags";
import { useShortcutsStore } from "@/store/shortcuts";
import { formatShortcut } from "@/lib/shortcuts";
import type { Priority } from "@/types";

interface FilterBarProps {
  readonly sortDir?: "asc" | "desc" | null;
  readonly sortDateDir?: "asc" | "desc" | null;
  readonly sortProjectDir?: "asc" | "desc" | null;
  readonly onSortByUrgency?: () => void;
  readonly onSortByDueDate?: () => void;
  readonly onSortByProject?: () => void;
}

export function FilterBar({ sortDir, sortDateDir, sortProjectDir, onSortByUrgency, onSortByDueDate, onSortByProject }: FilterBarProps) {
  const { t } = useTranslation();
  const { activeFilters, setFilters } = useUIStore();
  const { tags } = useTagStore();
  const sortUrgency = useShortcutsStore((s) => s.sortUrgency);
  const sortDueDate = useShortcutsStore((s) => s.sortDueDate);
  const sortProject = useShortcutsStore((s) => s.sortProject);

  const PRIORITY_LABELS: Record<Priority, string> = {
    none: t('priority.none'),
    low: t('priority.low'),
    medium: t('priority.medium'),
    high: t('priority.high'),
  };

  const selectedTagIds = activeFilters.tagIds ?? [];

  function toggleTag(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      setFilters({ tagIds: selectedTagIds.filter((id) => id !== tagId) });
    } else {
      setFilters({ tagIds: [...selectedTagIds, tagId] });
    }
  }

  const hasFilters =
    !!activeFilters.priority ||
    selectedTagIds.length > 0 ||
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

      {/* Tag filter */}
      <Popover>
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: selectedTagIds.length > 0 ? "secondary" : "outline", size: "sm" }),
            "h-7 gap-1 text-xs"
          )}
        >
          <Tag className="h-3 w-3" />
          {selectedTagIds.length > 0
            ? `${t('filter.tags')} · ${selectedTagIds.length}`
            : t('filter.tags')}
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1.5">{t('tag.noTags')}</p>
          ) : (
            <div className="space-y-1">
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                      selected && "bg-accent"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: tag.color ?? "var(--muted-foreground)" }}
                    />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Show completed toggle */}
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-7 text-xs",
          activeFilters.completed && "border-[var(--priority-low)] text-[var(--priority-low)] bg-[var(--priority-low)]/10"
        )}
        onClick={() =>
          setFilters({ completed: activeFilters.completed ? undefined : true })
        }
      >
        {t('filter.completed')}
      </Button>

      {/* Sort buttons + reset — pushed to the right */}
      <div className="ml-auto flex items-center gap-1">
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() =>
              setFilters({ priority: undefined, tagIds: [], completed: undefined })
            }
          >
            {t('filter.reset')}
          </Button>
        )}
        {onSortByUrgency && (
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-7 gap-0.5 px-1.5", sortDir == null ? "text-muted-foreground" : "bg-accent text-foreground")}
                onClick={onSortByUrgency}
              />
            }>
              <Flame className="h-3.5 w-3.5" />
              {sortDir != null && <span className="text-[10px] leading-none">{sortDir === "asc" ? "↑" : "↓"}</span>}
            </TooltipTrigger>
            <TooltipContent>
              {t('sort.urgency')}
              {formatShortcut(sortUrgency) && (
                <kbd className="ml-1 text-xs opacity-60">{formatShortcut(sortUrgency)}</kbd>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {onSortByDueDate && (
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-7 gap-0.5 px-1.5", sortDateDir == null ? "text-muted-foreground" : "bg-accent text-foreground")}
                onClick={onSortByDueDate}
              />
            }>
              <CalendarArrowUp className="h-3.5 w-3.5" />
              {sortDateDir != null && <span className="text-[10px] leading-none">{sortDateDir === "asc" ? "↑" : "↓"}</span>}
            </TooltipTrigger>
            <TooltipContent>
              {t('sort.dueDate')}
              {formatShortcut(sortDueDate) && (
                <kbd className="ml-1 text-xs opacity-60">{formatShortcut(sortDueDate)}</kbd>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {onSortByProject && (
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-7 gap-0.5 px-1.5", sortProjectDir == null ? "text-muted-foreground" : "bg-accent text-foreground")}
                onClick={onSortByProject}
              />
            }>
              <Layers className="h-3.5 w-3.5" />
              {sortProjectDir != null && <span className="text-[10px] leading-none">{sortProjectDir === "asc" ? "↑" : "↓"}</span>}
            </TooltipTrigger>
            <TooltipContent>
              {t('sort.project')}
              {formatShortcut(sortProject) && (
                <kbd className="ml-1 text-xs opacity-60">{formatShortcut(sortProject)}</kbd>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
