import { describe, expect, it } from "vitest";
import type { SortShortcut } from "./shortcuts";
import { formatShortcut, matchesShortcut } from "./shortcuts";

function makeEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		key: "s",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	} as KeyboardEvent;
}

const cmdS: SortShortcut = {
	key: "s",
	meta: true,
	ctrl: false,
	alt: false,
	shift: false,
};
const disabled: SortShortcut = {
	key: null,
	meta: false,
	ctrl: false,
	alt: false,
	shift: false,
};

describe("matchesShortcut", () => {
	it("returns false when shortcut is disabled (key=null)", () => {
		expect(
			matchesShortcut(makeEvent({ key: "s", metaKey: true }), disabled),
		).toBe(false);
	});

	it("matches exact combination", () => {
		expect(matchesShortcut(makeEvent({ key: "s", metaKey: true }), cmdS)).toBe(
			true,
		);
	});

	it("is case-insensitive for the key", () => {
		expect(matchesShortcut(makeEvent({ key: "S", metaKey: true }), cmdS)).toBe(
			true,
		);
	});

	it("does not match if meta differs", () => {
		expect(matchesShortcut(makeEvent({ key: "s", metaKey: false }), cmdS)).toBe(
			false,
		);
	});

	it("does not match if a different modifier is pressed", () => {
		expect(
			matchesShortcut(
				makeEvent({ key: "s", metaKey: true, shiftKey: true }),
				cmdS,
			),
		).toBe(false);
	});

	it("matches shortcut with multiple modifiers", () => {
		const altShiftU: SortShortcut = {
			key: "u",
			meta: false,
			ctrl: false,
			alt: true,
			shift: true,
		};
		expect(
			matchesShortcut(
				makeEvent({ key: "u", altKey: true, shiftKey: true }),
				altShiftU,
			),
		).toBe(true);
	});

	it("matches shortcut with no modifiers", () => {
		const justA: SortShortcut = {
			key: "a",
			meta: false,
			ctrl: false,
			alt: false,
			shift: false,
		};
		expect(matchesShortcut(makeEvent({ key: "a" }), justA)).toBe(true);
	});
});

describe("formatShortcut", () => {
	it("returns empty string when disabled", () => {
		expect(formatShortcut(disabled, true)).toBe("");
		expect(formatShortcut(disabled, false)).toBe("");
	});

	describe("macOS format", () => {
		it("formats Cmd+S as ⌘S", () => {
			expect(formatShortcut(cmdS, true)).toBe("⌘S");
		});

		it("formats Ctrl+D as ⌃D", () => {
			const ctrlD: SortShortcut = {
				key: "d",
				meta: false,
				ctrl: true,
				alt: false,
				shift: false,
			};
			expect(formatShortcut(ctrlD, true)).toBe("⌃D");
		});

		it("formats Alt+Shift+U as ⌥⇧U", () => {
			const altShiftU: SortShortcut = {
				key: "u",
				meta: false,
				ctrl: false,
				alt: true,
				shift: true,
			};
			expect(formatShortcut(altShiftU, true)).toBe("⌥⇧U");
		});

		it("formats all modifiers in order: ⌘⌃⌥⇧", () => {
			const all: SortShortcut = {
				key: "x",
				meta: true,
				ctrl: true,
				alt: true,
				shift: true,
			};
			expect(formatShortcut(all, true)).toBe("⌘⌃⌥⇧X");
		});
	});

	describe("Windows/Linux format", () => {
		it("formats Ctrl+S as Ctrl+S", () => {
			const ctrlS: SortShortcut = {
				key: "s",
				meta: false,
				ctrl: true,
				alt: false,
				shift: false,
			};
			expect(formatShortcut(ctrlS, false)).toBe("Ctrl+S");
		});

		it("formats Alt+Shift+U as Alt+Shift+U", () => {
			const altShiftU: SortShortcut = {
				key: "u",
				meta: false,
				ctrl: false,
				alt: true,
				shift: true,
			};
			expect(formatShortcut(altShiftU, false)).toBe("Alt+Shift+U");
		});

		it("formats Win+S as Win+S", () => {
			expect(formatShortcut(cmdS, false)).toBe("Win+S");
		});

		it("formats all modifiers in order: Win+Ctrl+Alt+Shift", () => {
			const all: SortShortcut = {
				key: "x",
				meta: true,
				ctrl: true,
				alt: true,
				shift: true,
			};
			expect(formatShortcut(all, false)).toBe("Win+Ctrl+Alt+Shift+X");
		});
	});
});
