import { describe, expect, it } from "vitest";
import en from "./locales/en";
import fr from "./locales/fr";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
	const keys: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === "object") {
			keys.push(...flatten(value as Record<string, unknown>, path));
		} else {
			keys.push(path);
		}
	}
	return keys.sort();
}

describe("clés de synchronisation", () => {
	it("EN et FR exposent exactement les mêmes clés sync.*", () => {
		const enKeys = flatten(en.sync as Record<string, unknown>);
		const frKeys = flatten(fr.sync as Record<string, unknown>);
		expect(frKeys).toEqual(enKeys);
	});

	it("aucune valeur sync n'est vide", () => {
		for (const locale of [en, fr]) {
			for (const key of flatten(locale.sync as Record<string, unknown>)) {
				const value = key
					.split(".")
					.reduce<unknown>(
						(acc, part) => (acc as Record<string, unknown>)[part],
						locale.sync,
					);
				expect(typeof value, key).toBe("string");
				expect((value as string).trim(), key).not.toBe("");
			}
		}
	});

	it("couvre un libellé par statut moteur", () => {
		for (const status of [
			"idle",
			"syncing",
			"locked",
			"awaitingFirstSync",
			"reauthRequired",
			"protocolMismatch",
		]) {
			expect(Object.keys(en.sync.status)).toContain(status);
		}
	});
});
