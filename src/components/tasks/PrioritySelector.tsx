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

const LABELS: Record<Priority, string> = {
  none: "Aucune",
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
};

const COLORS: Record<Priority, string> = {
  none: "var(--muted-foreground)",
  low: "var(--priority-low)",
  medium: "var(--priority-medium)",
  high: "var(--priority-high)",
};

interface PrioritySelectorProps {
  value: Priority;
  onChange: (p: Priority) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
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
