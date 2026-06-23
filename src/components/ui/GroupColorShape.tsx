import React from "react";
import {
	darkenColor,
	getShapeForColor,
	type ShapeId,
} from "@/lib/group-shapes";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";

interface GroupColorShapeProps {
	color: string;
	size?: number;
	className?: string;
}

const SHAPE_PATHS: Record<
	ShapeId,
	React.ReactElement<React.SVGProps<SVGElement>>
> = {
	circle: <circle cx="5" cy="5" r="4.5" />,
	square: <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />,
	triangle: <polygon points="5,0.5 9.5,9.5 0.5,9.5" />,
	diamond: <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />,
	pentagon: <polygon points="5,0.3 9.5,3.6 7.8,9.2 2.2,9.2 0.5,3.6" />,
	hexagon: <polygon points="5,0.3 9.2,2.6 9.2,7.4 5,9.7 0.8,7.4 0.8,2.6" />,
	star: (
		<polygon points="5,0.5 6.2,3.8 9.8,3.8 6.9,5.9 8,9.2 5,7.2 2,9.2 3.1,5.9 0.2,3.8 3.8,3.8" />
	),
	cross: <path d="M3.5,0.5 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z" />,
	arrow: <polygon points="0.5,3.5 6,3.5 6,1 9.5,5 6,9 6,6.5 0.5,6.5" />,
	drop: (
		<path d="M5,0.5 C5,0.5 9.5,5.5 9.5,7 A4.5,4.5 0 0,1 0.5,7 C0.5,5.5 5,0.5 5,0.5 Z" />
	),
};

export function GroupColorShape({
	color,
	size = 8,
	className,
}: GroupColorShapeProps) {
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);

	if (!colorblindMode) {
		return (
			<span
				className={cn("rounded-full inline-block shrink-0", className)}
				style={{
					backgroundColor: color,
					width: size,
					height: size,
				}}
			/>
		);
	}

	const shapeId = getShapeForColor(color);
	const stroke = darkenColor(color, 0.2);

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 10 10"
			aria-hidden="true"
			className={cn("inline-block shrink-0", className)}
			style={{ display: "inline-block" }}
		>
			{React.cloneElement(SHAPE_PATHS[shapeId], {
				fill: color,
				stroke,
				strokeWidth: "0.8",
			})}
		</svg>
	);
}
