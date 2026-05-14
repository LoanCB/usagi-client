import { afterEach, describe, expect, it, vi } from "vitest";
import {
	formatDate,
	hasModifier,
	isOverdue,
	isMac,
	modifierLabel,
	todayIso,
} from "./utils";

describe("formatDate", () => {
	it("formats an ISO date to a short locale string", () => {
		expect(formatDate("2026-04-12")).toMatch(/Apr\s*12/);
	});

	it("respects an optional locale param", () => {
		const enResult = formatDate("2026-04-12", "en-US");
		const frResult = formatDate("2026-04-12", "fr-FR");
		expect(typeof frResult).toBe("string");
		expect(frResult.length).toBeGreaterThan(0);
		// French locale produces a different string than English
		expect(frResult).not.toBe(enResult);
	});
});

describe("isOverdue", () => {
	it("returns true for a past date", () => {
		expect(isOverdue("2000-01-01")).toBe(true);
	});

	it("returns false for today", () => {
		const now = new Date();
		const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		expect(isOverdue(iso)).toBe(false);
	});

	it("returns false for a future date", () => {
		expect(isOverdue("2099-12-31")).toBe(false);
	});
});

describe("todayIso", () => {
	it("returns the current local date in YYYY-MM-DD format", () => {
		const now = new Date();
		const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		expect(todayIso()).toBe(expected);
		expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("isMac", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns true when userAgentData.platform is macOS", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "Mozilla/5.0",
		});
		expect(isMac()).toBe(true);
	});

	it("returns false when userAgentData.platform is Win32", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "Mozilla/5.0",
		});
		expect(isMac()).toBe(false);
	});

	it("falls back to userAgent when userAgentData is absent", () => {
		vi.stubGlobal("navigator", {
			userAgentData: undefined,
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
		});
		expect(isMac()).toBe(true);
	});

	it("returns false when userAgentData is absent and userAgent is Windows", () => {
		vi.stubGlobal("navigator", {
			userAgentData: undefined,
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
		});
		expect(isMac()).toBe(false);
	});
});

describe("modifierLabel", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns ⌘ on Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "",
		});
		expect(modifierLabel()).toBe("⌘");
	});

	it("returns 'Ctrl+' on non-Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "",
		});
		expect(modifierLabel()).toBe("Ctrl+");
	});
});

describe("hasModifier", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns true when metaKey is pressed on Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: true, ctrlKey: false } as KeyboardEvent)).toBe(true);
	});

	it("returns false when ctrlKey is pressed on Mac (wrong modifier)", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "macOS" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: false, ctrlKey: true } as KeyboardEvent)).toBe(false);
	});

	it("returns true when ctrlKey is pressed on non-Mac", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: false, ctrlKey: true } as KeyboardEvent)).toBe(true);
	});

	it("returns false when metaKey is pressed on non-Mac (wrong modifier)", () => {
		vi.stubGlobal("navigator", {
			userAgentData: { platform: "Win32" },
			userAgent: "",
		});
		expect(hasModifier({ metaKey: true, ctrlKey: false } as KeyboardEvent)).toBe(false);
	});
});
