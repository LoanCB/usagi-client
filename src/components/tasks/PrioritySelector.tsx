import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button-variants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PRIORITY_ORDER } from "@/theme/priorityColors";
import type { Priority } from "@/types";
import { PriorityIcon } from "./TaskItem/PriorityIcon";

interface PrioritySelectorProps {
	readonly value: Priority;
	readonly onChange: (p: Priority) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
	const { t } = useTranslation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"gap-2 h-7 px-2 justify-start",
				)}
			>
				<PriorityIcon priority={value} />
				<span className="text-xs">{t(`priority.${value}`)}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{PRIORITY_ORDER.map((p) => (
					<DropdownMenuItem
						key={p}
						onClick={() => onChange(p)}
						className="gap-2"
					>
						<PriorityIcon priority={p} />
						{t(`priority.${p}`)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
