import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button-variants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import type { Priority } from "@/types";

const COLORS: Record<Priority, string> = {
	none: "var(--muted-foreground)",
	low: "var(--priority-low)",
	medium: "var(--priority-medium)",
	high: "var(--priority-high)",
};

const PRIORITY_DOT: Record<Priority, string> = {
	high: "#ef4444",
	medium: "#eab308",
	low: "#22c55e",
	none: "transparent",
};

const PRIORITY_BARS_GLOW: Record<Priority, string> = {
	high: "0 0 3px rgba(239,68,68,0.5)",
	medium: "0 0 3px rgba(234,179,8,0.45)",
	low: "0 0 3px rgba(34,197,94,0.4)",
	none: "none",
};

function PriorityBars({ priority }: { priority: Priority }) {
	if (priority === "none") {
		return <span style={{ width: 13, display: "inline-block" }} />;
	}
	return (
		<span
			style={{
				display: "flex",
				alignItems: "flex-end",
				gap: 1.5,
				height: 11,
			}}
		>
			{[
				{ id: "low", height: 4, active: true },
				{
					id: "medium",
					height: 7,
					active: priority === "medium" || priority === "high",
				},
				{ id: "high", height: 11, active: priority === "high" },
			].map((bar) => (
				<span
					key={bar.id}
					style={{
						width: 3,
						height: bar.height,
						borderRadius: 1,
						background: PRIORITY_DOT[priority],
						opacity: bar.active ? 1 : 0.2,
						boxShadow: bar.active ? PRIORITY_BARS_GLOW[priority] : "none",
					}}
				/>
			))}
		</span>
	);
}

interface PrioritySelectorProps {
	readonly value: Priority;
	readonly onChange: (p: Priority) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
	const { t } = useTranslation();
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);

	const LABELS: Record<Priority, string> = {
		none: t("priority.none"),
		low: t("priority.low"),
		medium: t("priority.medium"),
		high: t("priority.high"),
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"gap-2 h-7 px-2 justify-start",
				)}
			>
				{colorblindMode ? (
					<PriorityBars priority={value} />
				) : (
					<Flag className="h-3.5 w-3.5" style={{ color: COLORS[value] }} />
				)}
				<span className="text-xs">{LABELS[value]}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{(["none", "low", "medium", "high"] as Priority[]).map((p) => (
					<DropdownMenuItem
						key={p}
						onClick={() => onChange(p)}
						className="gap-2"
					>
						{colorblindMode ? (
							<PriorityBars priority={p} />
						) : (
							<Flag className="h-3.5 w-3.5" style={{ color: COLORS[p] }} />
						)}
						{LABELS[p]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
