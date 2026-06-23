export type ShapeId =
	| "circle"
	| "square"
	| "triangle"
	| "diamond"
	| "pentagon"
	| "hexagon"
	| "star"
	| "cross"
	| "arrow"
	| "drop";

export const COLOR_SHAPE_MAP: Record<string, ShapeId> = {
	// Reds / Oranges 1 → circle
	"#ef4444": "circle",
	"#f97316": "circle",
	// Reds / Oranges 2 → square
	"#f59e0b": "square",
	"#eab308": "square",
	// Greens 1 → triangle
	"#84cc16": "triangle",
	"#22c55e": "triangle",
	// Greens 2 → diamond
	"#10b981": "diamond",
	"#14b8a6": "diamond",
	// Blues 1 → pentagon
	"#06b6d4": "pentagon",
	"#3b82f6": "pentagon",
	// Blues 2 → hexagon
	"#6366f1": "hexagon",
	"#8b5cf6": "hexagon",
	// Purples / Pinks 1 → star
	"#a855f7": "star",
	"#ec4899": "star",
	// Purples / Pinks 2 → cross
	"#f43f5e": "cross",
	"#e11d48": "cross",
	// Neutrals 1 → arrow
	"#64748b": "arrow",
	"#6b7280": "arrow",
	// Neutrals 2 → drop
	"#78716c": "drop",
	"#d97706": "drop",
};

export function getShapeForColor(color: string): ShapeId {
	return COLOR_SHAPE_MAP[color] ?? "circle";
}

export function darkenColor(hex: string, amount: number): string {
	if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);

	// Convertir RGB → HSL
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	let h = 0;
	let s = 0;
	let l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case rn:
				h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
				break;
			case gn:
				h = ((bn - rn) / d + 2) / 6;
				break;
			case bn:
				h = ((rn - gn) / d + 4) / 6;
				break;
		}
	}

	l = Math.max(0, l - amount);

	// Convertir HSL → RGB
	function hue2rgb(p: number, q: number, t: number): number {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return p + (q - p) * 6 * tt;
		if (tt < 1 / 2) return q;
		if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
		return p;
	}

	let rr: number;
	let gg: number;
	let bb: number;
	if (s === 0) {
		rr = gg = bb = l;
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		rr = hue2rgb(p, q, h + 1 / 3);
		gg = hue2rgb(p, q, h);
		bb = hue2rgb(p, q, h - 1 / 3);
	}

	const toHex = (n: number) =>
		Math.round(n * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}
