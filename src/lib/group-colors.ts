import { PRESET_COLORS } from "@/lib/colors";
import type { ProjectGroup } from "@/types";

export const GROUP_COLORS: string[] = [...PRESET_COLORS];

export function pickGroupColor(existingGroups: ProjectGroup[]): string {
	const usage = new Map<string, number>(GROUP_COLORS.map((c) => [c, 0]));
	for (const g of existingGroups) {
		if (usage.has(g.color)) {
			usage.set(g.color, (usage.get(g.color) ?? 0) + 1);
		}
	}
	let min = Infinity;
	let picked = GROUP_COLORS[0];
	for (const [color, count] of usage) {
		if (count < min) {
			min = count;
			picked = color;
		}
	}
	return picked;
}
