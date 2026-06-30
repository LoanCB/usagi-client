interface ResizeHandleProps {
	onMouseDown: (e: React.MouseEvent) => void;
	onDoubleClick: () => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	isDragging: boolean;
	ariaLabel: string;
}

export function ResizeHandle({
	onMouseDown,
	onDoubleClick,
	onKeyDown,
	isDragging,
	ariaLabel,
}: Readonly<ResizeHandleProps>) {
	return (
		// A native <button> gives screen-reader users a focusable, keyboard-operable
		// control for free; arrow keys resize via onKeyDown (wired through useResizable),
		// double-click resets, and mouse drag still works through onMouseDown.
		<button
			type="button"
			aria-label={ariaLabel}
			onMouseDown={onMouseDown}
			onDoubleClick={onDoubleClick}
			onKeyDown={onKeyDown}
			className={[
				"group relative w-3 shrink-0 h-full cursor-col-resize transition-colors duration-150 flex items-center justify-center",
				"appearance-none border-0 bg-transparent p-0",
				"outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
		</button>
	);
}
