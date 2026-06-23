import { describe, expect, it } from "vitest";
import {
	COLOR_SHAPE_MAP,
	darkenColor,
	getShapeForColor,
} from "@/lib/group-shapes";

describe("getShapeForColor", () => {
	it("retourne la forme associée à une couleur connue", () => {
		expect(getShapeForColor("#ef4444")).toBe("circle");
		expect(getShapeForColor("#f97316")).toBe("circle");
		expect(getShapeForColor("#f59e0b")).toBe("square");
		expect(getShapeForColor("#84cc16")).toBe("triangle");
		expect(getShapeForColor("#10b981")).toBe("diamond");
		expect(getShapeForColor("#06b6d4")).toBe("pentagon");
		expect(getShapeForColor("#6366f1")).toBe("hexagon");
		expect(getShapeForColor("#a855f7")).toBe("star");
		expect(getShapeForColor("#f43f5e")).toBe("cross");
		expect(getShapeForColor("#64748b")).toBe("arrow");
		expect(getShapeForColor("#78716c")).toBe("drop");
	});

	it("retourne 'circle' pour une couleur inconnue", () => {
		expect(getShapeForColor("#000000")).toBe("circle");
		expect(getShapeForColor("")).toBe("circle");
	});

	it("COLOR_SHAPE_MAP contient exactement 20 couleurs", () => {
		expect(Object.keys(COLOR_SHAPE_MAP)).toHaveLength(20);
	});
});

describe("darkenColor", () => {
	it("assombrit une couleur rouge", () => {
		const result = darkenColor("#ef4444", 0.2);
		expect(result).toMatch(/^#[0-9a-f]{6}$/i);
		expect(result).not.toBe("#ef4444");
	});

	it("retourne la couleur inchangée si amount=0", () => {
		expect(darkenColor("#3b82f6", 0)).toBe("#3b82f6");
	});

	it("ne produit pas de valeurs négatives (clamp à 0)", () => {
		const result = darkenColor("#000000", 0.5);
		expect(result).toBe("#000000");
	});
});
