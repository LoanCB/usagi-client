import { describe, expect, it } from "vitest";
import { pickConfirmationPositions } from "./recovery-confirmation";

describe("pickConfirmationPositions", () => {
	it("rend le nombre demandé de positions distinctes et croissantes", () => {
		const positions = pickConfirmationPositions(24, 3);
		expect(positions).toHaveLength(3);
		expect(new Set(positions).size).toBe(3);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	it("reste dans les bornes 1..wordCount", () => {
		for (let i = 0; i < 200; i++) {
			for (const p of pickConfirmationPositions(24, 3)) {
				expect(p).toBeGreaterThanOrEqual(1);
				expect(p).toBeLessThanOrEqual(24);
			}
		}
	});

	it("est déterministe quand on injecte le générateur", () => {
		const constant = () => 0;
		expect(pickConfirmationPositions(24, 3, constant)).toEqual([1, 2, 3]);
	});

	it("couvre l'ensemble des positions sur de nombreux tirages", () => {
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) {
			for (const p of pickConfirmationPositions(24, 3)) seen.add(p);
		}
		// Un tirage biaisé vers le début laisserait la fin inatteignable.
		expect(seen.size).toBe(24);
	});

	it("ne boucle pas si on demande autant de positions que de mots", () => {
		expect(pickConfirmationPositions(3, 3)).toEqual([1, 2, 3]);
	});

	it("plafonne au nombre de mots disponibles", () => {
		expect(pickConfirmationPositions(2, 5)).toEqual([1, 2]);
	});
});
