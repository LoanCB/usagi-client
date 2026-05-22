import { Check, CheckCircle2, Circle, Clock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CalendarStatusFilterValue =
	| "completed"
	| "overdue"
	| "pending"
	| undefined;

interface CalendarStatusFilterProps {
	readonly value: CalendarStatusFilterValue;
	readonly onChange: (value: CalendarStatusFilterValue) => void;
}

const STATUS_CONFIG = {
	pending: {
		icon: Circle,
		color: "#94a3b8",
		borderColor: "rgba(148,163,184,0.4)",
		background: "rgba(148,163,184,0.08)",
	},
	overdue: {
		icon: Clock,
		color: "#f97316",
		borderColor: "rgba(249,115,22,0.4)",
		background: "rgba(249,115,22,0.08)",
	},
	completed: {
		icon: CheckCircle2,
		color: "#22c55e",
		borderColor: "rgba(34,197,94,0.4)",
		background: "rgba(34,197,94,0.08)",
	},
} as const;

export function CalendarStatusFilter({
	value,
	onChange,
}: CalendarStatusFilterProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	const config = value ? STATUS_CONFIG[value] : undefined;
	const Icon = config?.icon;

	const triggerStyle = config
		? {
				borderColor: config.borderColor,
				background: config.background,
				color: config.color,
			}
		: undefined;

	const options: Array<{ value: CalendarStatusFilterValue; label: string }> = [
		{ value: undefined, label: t("calendar.filter.allStatuses") },
		{ value: "pending", label: t("calendar.filter.pending") },
		{ value: "overdue", label: t("calendar.filter.overdue") },
		{ value: "completed", label: t("calendar.filter.completed") },
	];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label={t("calendar.filter.statusTrigger")}
				className={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"gap-1.5 h-7 px-2.5 text-xs border max-w-[10rem]",
					value === undefined && "border-border/40 text-muted-foreground",
				)}
				style={triggerStyle}
			>
				{Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
				<span className="truncate min-w-0">
					{value === undefined
						? t("calendar.filter.allStatuses")
						: t(`calendar.filter.${value}`)}
				</span>
				<span className="opacity-40 text-[10px]">▾</span>
			</PopoverTrigger>
			<PopoverContent className="w-44 p-2" align="end">
				<div className="space-y-0.5">
					{options.map((opt) => {
						const selected = value === opt.value;
						const optConfig = opt.value ? STATUS_CONFIG[opt.value] : null;
						const OptIcon = optConfig?.icon ?? null;
						return (
							<button
								type="button"
								key={String(opt.value)}
								onClick={() => {
									onChange(opt.value);
									setOpen(false);
								}}
								className={cn(
									"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
									selected && "bg-accent",
								)}
							>
								{OptIcon && optConfig ? (
									<OptIcon
										className="h-3.5 w-3.5 shrink-0"
										style={{ color: optConfig.color }}
									/>
								) : (
									<span className="h-3.5 w-3.5 shrink-0" />
								)}
								<span className="flex-1 text-left truncate">{opt.label}</span>
								{selected && <Check className="h-3.5 w-3.5 shrink-0" />}
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
