import { useCallback, useEffect, useRef, useState } from "react";

interface UseResizableOptions {
	storageKey: string;
	defaultWidth: number;
	minWidth: number;
	maxWidth: number;
}

interface UseResizableResult {
	width: number;
	isDragging: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
}

function readStoredWidth(storageKey: string, defaultWidth: number): number {
	const stored = localStorage.getItem(storageKey);
	if (stored === null) return defaultWidth;
	const parsed = Number(stored);
	return Number.isFinite(parsed) ? parsed : defaultWidth;
}

export function useResizable({
	storageKey,
	defaultWidth,
	minWidth,
	maxWidth,
}: UseResizableOptions): UseResizableResult {
	const [width, setWidth] = useState(() =>
		readStoredWidth(storageKey, defaultWidth),
	);
	const [isDragging, setIsDragging] = useState(false);

	const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			dragState.current = { startX: e.clientX, startWidth: width };
			setIsDragging(true);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		},
		[width],
	);

	useEffect(() => {
		if (!isDragging) return;

		function handleMouseMove(e: MouseEvent) {
			if (!dragState.current) return;
			const delta = dragState.current.startX - e.clientX;
			const newWidth = Math.min(
				maxWidth,
				Math.max(minWidth, dragState.current.startWidth + delta),
			);
			setWidth(newWidth);
		}

		function handleMouseUp() {
			setIsDragging(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			if (dragState.current) {
				setWidth((w) => {
					localStorage.setItem(storageKey, String(w));
					return w;
				});
			}
			dragState.current = null;
		}

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, minWidth, maxWidth, storageKey]);

	return { width, isDragging, onMouseDown };
}
