import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";

const COLORS: Record<Priority, string> = {
  none: "var(--muted-foreground)",
  low: "var(--priority-low)",
  medium: "var(--priority-medium)",
  high: "var(--priority-high)",
};

interface PrioritySelectorProps {
  readonly value: Priority;
  readonly onChange: (p: Priority) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  const { t } = useTranslation();

  const LABELS: Record<Priority, string> = {
    none: t('priority.none'),
    low: t('priority.low'),
    medium: t('priority.medium'),
    high: t('priority.high'),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 h-7 px-2")}
      >
        <Flag className="h-3.5 w-3.5" style={{ color: COLORS[value] }} />
        <span className="text-xs">{LABELS[value]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["none", "low", "medium", "high"] as Priority[]).map((p) => (
          <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2">
            <Flag className="h-3.5 w-3.5" style={{ color: COLORS[p] }} />
            {LABELS[p]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
