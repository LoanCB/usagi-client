interface DropIndicatorProps {
	color?: string;
}

export function DropIndicator({
	color = "hsl(var(--sidebar-primary))",
}: DropIndicatorProps) {
	return (
		<div className="relative flex items-center my-0.5 px-2 pointer-events-none">
			<div
				className="h-[5px] w-[5px] rounded-full shrink-0"
				style={{ backgroundColor: color }}
			/>
			<div className="flex-1 h-[2px]" style={{ backgroundColor: color }} />
			<div
				className="h-[5px] w-[5px] rounded-full shrink-0"
				style={{ backgroundColor: color }}
			/>
		</div>
	);
}
