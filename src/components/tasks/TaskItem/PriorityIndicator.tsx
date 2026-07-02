import type { Priority } from "@/types";

const PRIORITY_DOT: Record<Priority, string> = {
	high: "#ef4444",
	medium: "#eab308",
	low: "#22c55e",
	none: "transparent",
};

const PRIORITY_GLOW: Record<Priority, string> = {
	high: "0 0 5px rgba(239,68,68,0.7)",
	medium: "0 0 5px rgba(234,179,8,0.6)",
	low: "0 0 5px rgba(34,197,94,0.5)",
	none: "none",
};

const PRIORITY_BARS_GLOW: Record<Priority, string> = {
	high: "0 0 3px rgba(239,68,68,0.5)",
	medium: "0 0 3px rgba(234,179,8,0.45)",
	low: "0 0 3px rgba(34,197,94,0.4)",
	none: "none",
};

interface PriorityIndicatorProps {
	readonly priority: Priority;
	readonly colorblindMode: boolean;
}

export function PriorityIndicator({
	priority,
	colorblindMode,
}: PriorityIndicatorProps) {
	return (
		<span className="shrink-0" data-testid="priority-indicator">
			{!colorblindMode ? (
				<span
					data-testid="priority-dot"
					className="rounded-full"
					style={{
						display: "block",
						width: 7,
						height: 7,
						background: PRIORITY_DOT[priority],
						boxShadow: PRIORITY_GLOW[priority],
						border:
							priority === "none" ? "1.5px solid var(--border)" : undefined,
						marginLeft: 2,
					}}
				/>
			) : priority !== "none" ? (
				<span
					data-testid="priority-bars"
					style={{
						display: "flex",
						alignItems: "flex-end",
						gap: 1.5,
						height: 11,
						marginLeft: 2,
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
			) : (
				<span style={{ width: 13, display: "inline-block" }} />
			)}
		</span>
	);
}
