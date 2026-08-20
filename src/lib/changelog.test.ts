import { describe, expect, it } from "vitest";
import {
	getDisplayVersions,
	getReleasedVersions,
	getVersionsSince,
	localizeEntry,
} from "./changelog";

describe("getDisplayVersions", () => {
	it("lists the newest version first", () => {
		const display = getDisplayVersions();
		expect(display[0].version).toBe("2026.3.1");
	});

	it("excludes versions with no user-facing changes", () => {
		const display = getDisplayVersions();
		expect(display.every((v) => Object.keys(v.changes).length > 0)).toBe(true);
	});
});

describe("getReleasedVersions", () => {
	it("excludes the Unreleased entry and empty versions", () => {
		const released = getReleasedVersions();
		expect(released.every((v) => v.tag !== null)).toBe(true);
		expect(released.every((v) => Object.keys(v.changes).length > 0)).toBe(true);
		expect(released.some((v) => v.version === "Unreleased")).toBe(false);
	});

	it("keeps the file's newest-first ordering", () => {
		const released = getReleasedVersions();
		expect(released[0].version).toBe("2026.3.1");
	});
});

describe("getVersionsSince", () => {
	it("returns only versions newer than the given one", () => {
		const since = getVersionsSince("2026.2.0");
		expect(since.map((v) => v.version)).toEqual([
			"2026.3.1",
			"2026.3.0",
			"2026.2.1",
		]);
	});

	it("returns nothing when already on the latest", () => {
		expect(getVersionsSince("2026.3.1")).toEqual([]);
	});

	it("falls back to the full history for an unknown marker", () => {
		expect(getVersionsSince("does-not-exist")).toEqual(getReleasedVersions());
	});
});

describe("localizeEntry", () => {
	const entry = { en: "console errors", fr: "erreurs console" };

	it("picks French for fr locales", () => {
		expect(localizeEntry(entry, "fr")).toBe("erreurs console");
		expect(localizeEntry(entry, "fr-FR")).toBe("erreurs console");
	});

	it("falls back to English otherwise", () => {
		expect(localizeEntry(entry, "en")).toBe("console errors");
		expect(localizeEntry(entry, "de")).toBe("console errors");
	});
});
