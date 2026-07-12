import type { Priority } from "@/types";
import { PriorityIcon } from "./PriorityIcon";

interface PriorityIndicatorProps {
	readonly priority: Priority;
}

export function PriorityIndicator({ priority }: PriorityIndicatorProps) {
	return (
		<span className="shrink-0" data-testid="priority-indicator">
			<PriorityIcon priority={priority} />
		</span>
	);
}
