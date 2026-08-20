import { describe, expect, it } from "vitest";
import { type FieldStamps, stampFields } from "./field-timestamps";

const NOW = "2026-08-20T10:00:00.000Z";
const DEV = "device-a";

function parse(json: string): FieldStamps {
	return JSON.parse(json) as FieldStamps;
}

describe("stampFields", () => {
	it("creates a map from nothing", () => {
		expect(parse(stampFields(null, ["title"], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});

	it("adds fields without dropping existing ones", () => {
		const before = JSON.stringify({
			title: { t: "2026-01-01T00:00:00.000Z", d: "device-b" },
		});
		expect(parse(stampFields(before, ["priority"], NOW, DEV))).toEqual({
			title: { t: "2026-01-01T00:00:00.000Z", d: "device-b" },
			priority: { t: NOW, d: DEV },
		});
	});

	it("overwrites the stamp of a re-edited field", () => {
		const before = JSON.stringify({
			title: { t: "2026-01-01T00:00:00.000Z", d: "device-b" },
		});
		expect(parse(stampFields(before, ["title"], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});

	it("recovers from corrupt JSON rather than throwing", () => {
		expect(parse(stampFields("{not json", ["title"], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});

	it("returns the existing map untouched when no field changed", () => {
		const before = JSON.stringify({ title: { t: NOW, d: DEV } });
		expect(parse(stampFields(before, [], NOW, DEV))).toEqual({
			title: { t: NOW, d: DEV },
		});
	});
});
