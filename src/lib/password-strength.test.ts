import { describe, expect, it } from "vitest";
import { isStrongPassword } from "./password-strength";

describe("isStrongPassword", () => {
	it("accepts 8+ chars with lowercase, uppercase and a symbol", () => {
		expect(isStrongPassword("Abcdef!g")).toBe(true);
	});

	it("rejects a password missing a required class", () => {
		expect(isStrongPassword("abcdef!g")).toBe(false);
		expect(isStrongPassword("ABCDEF!G")).toBe(false);
		expect(isStrongPassword("Abcdefgh")).toBe(false);
		expect(isStrongPassword("Abcdef1g")).toBe(false);
	});

	it("rejects a complex password shorter than 8 characters", () => {
		expect(isStrongPassword("Abcd!ef")).toBe(false);
	});

	it("treats accented letters as letters, not symbols", () => {
		expect(isStrongPassword("Écoleabc")).toBe(false);
		expect(isStrongPassword("Écoleabc!")).toBe(true);
	});

	it("accepts a passphrase of 3+ words separated by spaces or dashes", () => {
		expect(isStrongPassword("one two three")).toBe(true);
		expect(isStrongPassword("one-two-three")).toBe(true);
		expect(isStrongPassword("one two-three")).toBe(true);
	});

	it("rejects fewer than 3 words and ignores empty separators", () => {
		expect(isStrongPassword("one two")).toBe(false);
		expect(isStrongPassword("one--two")).toBe(false);
		expect(isStrongPassword("  one   two  ")).toBe(false);
		expect(isStrongPassword("")).toBe(false);
	});
});
