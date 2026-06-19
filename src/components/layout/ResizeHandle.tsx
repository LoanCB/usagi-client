interface ResizeHandleProps {
	onMouseDown: (e: React.MouseEvent) => void;
	onDoubleClick: () => void;
	isDragging: boolean;
}

export function ResizeHandle({
	onMouseDown,
	onDoubleClick,
	isDragging,
}: Readonly<ResizeHandleProps>) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: resize handle is intentionally mouse-only
		<div
			onMouseDown={onMouseDown}
			onDoubleClick={onDoubleClick}
			className={[
				"group relative w-3 shrink-0 h-full cursor-col-resize transition-colors duration-150 flex items-center justify-center",
			].join(" ")}
		>
			{/* short thick bar centered, appears on hover */}
			<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
				<div
					className={[
						"w-1 h-16 rounded-full transition-opacity duration-150",
						"bg-muted-foreground/50",
						isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					].join(" ")}
				/>
			</div>
		</div>
	);
}
