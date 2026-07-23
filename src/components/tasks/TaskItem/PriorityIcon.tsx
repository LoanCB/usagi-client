import {
	Ban,
	ChevronDown,
	ChevronsDown,
	ChevronsUp,
	ChevronUp,
	Equal,
	type LucideIcon,
} from "lucide-react";
import { priorityColor } from "@/theme/priorityColors";
import type { Priority } from "@/types";

const PRIORITY_ICON: Record<Exclude<Priority, "none">, LucideIcon> = {
	lowest: ChevronsDown,
	low: ChevronDown,
	medium: Equal,
	high: ChevronUp,
	highest: ChevronsUp,
	blocker: Ban,
};

interface PriorityIconProps {
	readonly priority: Priority;
	readonly size?: number;
	readonly className?: string;
}

// Shape (chevron direction/count, equals, no-entry)
// distinguishes each level independently of color, so it stays accessible in
// colorblind mode without a separate rendering.
export function PriorityIcon({
	priority,
	size = 14,
	className,
}: PriorityIconProps) {
	if (priority === "none") {
		return <span style={{ width: size, display: "inline-block" }} />;
	}
	const Icon = PRIORITY_ICON[priority];
	return (
		<Icon
			className={className}
			style={{ color: priorityColor(priority) }}
			width={size}
			height={size}
			aria-hidden
		/>
	);
}
