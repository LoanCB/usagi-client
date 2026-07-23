import type { Priority } from "@/types";

// Single source of truth for priority colors. Jira-style scale (blue → red);
// the icon shape carries the meaning, color is only reinforcement.
export const PRIORITY_COLORS: Record<Exclude<Priority, "none">, string> = {
	lowest: "#79b8ff",
	low: "#2684ff",
	medium: "#eab308",
	high: "#f97316",
	highest: "#ef4444",
	blocker: "#991b1b",
};

// Ascending order, least to most critical.
export const PRIORITY_ORDER: readonly Priority[] = [
	"none",
	"lowest",
	"low",
	"medium",
	"high",
	"highest",
	"blocker",
];

export function priorityColor(priority: Priority): string | undefined {
	return priority === "none" ? undefined : PRIORITY_COLORS[priority];
}
